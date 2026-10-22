import { randomUUID } from 'crypto'
import { getStore, loadConfig, saveConfig, makeDefaultConnection, secretCodec, type StoredAccount } from '../config'
import { getLogger } from '../logger'
import { emitToRenderer } from '../windowBus'
import { ManagementApi, type RemoteProject } from './managementApi'
import { buildDirectUrl, buildPoolerSessionUrl, pickPrimaryPooler, pickServiceKey } from '../../core/dbUrl'
import type { CreateProjectInput } from '../../shared/managerApi'
import type {
  AccountProject,
  AccountSummary,
  ConnectionConfig,
  ImportProjectRequest,
  ImportProjectsResult,
} from '../../preload'

// ─── Storage ──────────────────────────────────────────────────────────────────

function readAccounts(): StoredAccount[] {
  return getStore().get('accounts', []) as StoredAccount[]
}

function writeAccounts(accounts: StoredAccount[]): void {
  getStore().set('accounts', accounts)
}

function summarize(account: StoredAccount): AccountSummary {
  return { id: account.id, name: account.name, createdAt: account.createdAt }
}

function requireAccount(accountId: string): StoredAccount {
  const account = readAccounts().find((a) => a.id === accountId)
  if (!account) throw new Error('Account not found. It may have been removed.')
  return account
}

/** Builds an API client for an account. The decrypted token never leaves this module's callers. */
function apiFor(account: StoredAccount): ManagementApi {
  const token = secretCodec.decode(account.token)
  if (!token) throw new Error(`The stored token for "${account.name}" could not be read. Remove the account and add it again.`)
  return new ManagementApi({ token })
}

/** API client for an account id, or undefined for standalone projects. Main process only. */
export function managementApiForAccount(accountId: string | undefined): ManagementApi | undefined {
  if (!accountId) return undefined
  const account = readAccounts().find((a) => a.id === accountId)
  return account ? apiFor(account) : undefined
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export function listAccounts(): AccountSummary[] {
  return readAccounts().map(summarize)
}

/** Validates the token against the API before storing it. */
export async function addAccount(name: string, token: string): Promise<AccountSummary> {
  const trimmedToken = token.trim()
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error('Give the account a name.')
  if (!trimmedToken) throw new Error('Paste a personal access token.')

  await new ManagementApi({ token: trimmedToken }).listOrganizations()

  const account: StoredAccount = {
    id: randomUUID(),
    name: trimmedName,
    token: secretCodec.encode(trimmedToken),
    createdAt: new Date().toISOString(),
  }
  writeAccounts([...readAccounts(), account])
  getLogger().info(`Account added: ${account.name}`)
  return summarize(account)
}

/**
 * Removes the account and its token. Projects already imported keep working as standalone
 * projects because they store their own service-role key and database URL.
 */
export function removeAccount(accountId: string): void {
  const account = requireAccount(accountId)
  writeAccounts(readAccounts().filter((a) => a.id !== accountId))

  const config = loadConfig()
  saveConfig({
    ...config,
    connections: config.connections.map((c) =>
      c.accountId === accountId ? { ...c, accountId: undefined } : c
    ),
  })
  getLogger().info(`Account removed: ${account.name}`)
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listAccountProjects(accountId: string): Promise<AccountProject[]> {
  const account = requireAccount(accountId)
  const projects = await apiFor(account).listProjects()
  const imported = new Map(
    loadConfig()
      .connections.filter((c) => c.accountId === accountId && c.projectRef)
      .map((c) => [c.projectRef!, c.id])
  )

  return projects.map((p) => ({
    ref: p.ref,
    name: p.name,
    region: p.region,
    status: p.status,
    organizationId: p.organization_id,
    importedConnectionId: imported.get(p.ref),
  }))
}

/**
 * Creates one project (connection) per requested ref: URL and service key come from the API;
 * the database URL is built from the password when one is given.
 */
export async function importAccountProjects(
  accountId: string,
  requests: ImportProjectRequest[]
): Promise<ImportProjectsResult> {
  const account = requireAccount(accountId)
  const api = apiFor(account)
  const remote = new Map((await api.listProjects()).map((p) => [p.ref, p]))
  const config = loadConfig()
  const result: ImportProjectsResult = { imported: [], failed: [] }
  const created: ConnectionConfig[] = []

  for (const request of requests) {
    const project = remote.get(request.ref)
    if (!project) {
      result.failed.push({ ref: request.ref, error: 'Project not found in this account.' })
      continue
    }
    if (config.connections.some((c) => c.accountId === accountId && c.projectRef === request.ref)) {
      result.failed.push({ ref: request.ref, error: 'Already imported.' })
      continue
    }

    try {
      const connection = await buildConnection(api, accountId, project, request.dbPassword)
      created.push(connection)
      result.imported.push({ ref: project.ref, connectionId: connection.id, hasDbUrl: !!connection.supabase.dbUrl })
    } catch (err: any) {
      getLogger().warn(`Import of ${request.ref} failed: ${err.message}`)
      result.failed.push({ ref: request.ref, error: err.message })
    }
  }

  if (created.length > 0) {
    // Drop the untouched placeholder project the first launch creates, so imports do not sit next to an empty row.
    const base = config.connections.filter((c) => !isUntouchedPlaceholder(c))
    saveConfig({ ...config, connections: [...base, ...created] })
  }
  return result
}

/** Sets the database password of a project and stores the resulting connection string. */
export async function setProjectDbPassword(
  connectionId: string,
  password: string
): Promise<{ dbUrl: string; source: 'pooler' | 'direct' }> {
  if (!password) throw new Error('Enter the database password.')
  const config = loadConfig()
  const connection = config.connections.find((c) => c.id === connectionId)
  if (!connection) throw new Error('Project not found.')
  if (!connection.projectRef) throw new Error('This project was not imported from an account; edit its Database URL directly.')

  const { dbUrl, source } = await resolveDbUrl(
    connection.accountId ? apiFor(requireAccount(connection.accountId)) : undefined,
    connection.projectRef,
    password
  )
  saveConfig({
    ...config,
    connections: config.connections.map((c) =>
      c.id === connectionId ? { ...c, supabase: { ...c.supabase, dbUrl } } : c
    ),
  })
  return { dbUrl, source }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildConnection(
  api: ManagementApi,
  accountId: string,
  project: RemoteProject,
  dbPassword?: string
): Promise<ConnectionConfig> {
  const serviceRoleKey = pickServiceKey(await api.getApiKeys(project.ref, true))
  if (!serviceRoleKey) {
    throw new Error('No service-role or secret API key is available for this project (it may be paused).')
  }

  const dbUrl = dbPassword ? (await resolveDbUrl(api, project.ref, dbPassword)).dbUrl : ''
  const base = makeDefaultConnection(randomUUID(), project.name)
  return {
    ...base,
    accountId,
    projectRef: project.ref,
    supabase: { url: `https://${project.ref}.supabase.co`, serviceRoleKey, dbUrl },
  }
}

/** Prefers the IPv4 session pooler; falls back to the direct host when the API has no pooler config. */
async function resolveDbUrl(
  api: ManagementApi | undefined,
  ref: string,
  password: string
): Promise<{ dbUrl: string; source: 'pooler' | 'direct' }> {
  if (api) {
    try {
      const pooler = pickPrimaryPooler(await api.getPoolerConfig(ref))
      if (pooler) return { dbUrl: buildPoolerSessionUrl(pooler, password), source: 'pooler' }
    } catch (err: any) {
      getLogger().warn(`Pooler lookup failed for ${ref}, using the direct host: ${err.message}`)
    }
  }
  return { dbUrl: buildDirectUrl(ref, password), source: 'direct' }
}

function isUntouchedPlaceholder(c: ConnectionConfig): boolean {
  return (
    c.id === 'default' &&
    !c.accountId &&
    !c.supabase.url &&
    !c.supabase.serviceRoleKey &&
    !c.supabase.dbUrl
  )
}

// ─── Creating projects ────────────────────────────────────────────────────────

const PROVISION_POLL_MS = 6_000
const PROVISION_GIVE_UP_MS = 20 * 60 * 1000

/**
 * Creates a project through the API and registers it right away as a connection; the service key and
 * database URL are filled in by a watcher once Supabase reports the project as healthy.
 */
export async function createAccountProject(input: CreateProjectInput): Promise<{ ref: string; connectionId: string }> {
  const account = requireAccount(input.accountId)
  const api = apiFor(account)
  const project = await api.createProject({
    name: input.name,
    organization_slug: input.organizationSlug,
    db_pass: input.dbPassword,
    region: input.region,
    plan: input.plan,
  })

  const base = makeDefaultConnection(randomUUID(), project.name)
  const connection: ConnectionConfig = {
    ...base,
    accountId: input.accountId,
    projectRef: project.ref,
    supabase: { url: `https://${project.ref}.supabase.co`, serviceRoleKey: '', dbUrl: '' },
  }
  const config = loadConfig()
  saveConfig({ ...config, connections: [...config.connections.filter((c) => !isUntouchedPlaceholder(c)), connection] })

  void watchProvisioning(api, connection.id, project.ref, input.dbPassword)
  return { ref: project.ref, connectionId: connection.id }
}

async function watchProvisioning(api: ManagementApi, connectionId: string, ref: string, password: string): Promise<void> {
  const logger = getLogger()
  const deadline = Date.now() + PROVISION_GIVE_UP_MS

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, PROVISION_POLL_MS))
    try {
      const current = (await api.listProjects()).find((p) => p.ref === ref)
      if (!current) {
        logger.warn(`Provisioning watcher: project ${ref} disappeared`)
        return
      }
      if (current.status === 'INIT_FAILED') {
        logger.error(`Project ${ref} failed to initialise`)
        emitToRenderer('manager:changed', {})
        return
      }
      if (current.status !== 'ACTIVE_HEALTHY') {
        emitToRenderer('manager:changed', {})
        continue
      }

      const serviceRoleKey = pickServiceKey(await api.getApiKeys(ref, true)) ?? ''
      const { dbUrl } = await resolveDbUrl(api, ref, password)
      const config = loadConfig()
      saveConfig({
        ...config,
        connections: config.connections.map((c) =>
          c.id === connectionId ? { ...c, supabase: { ...c.supabase, serviceRoleKey, dbUrl } } : c
        ),
      })
      logger.info(`Project ${ref} is ready and connected`)
      emitToRenderer('manager:changed', {})
      return
    } catch (err: any) {
      logger.warn(`Provisioning watcher for ${ref}: ${err.message}`)
    }
  }
  logger.warn(`Gave up waiting for project ${ref}; set its database password manually when it is ready`)
}
