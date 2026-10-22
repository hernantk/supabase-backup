import { loadConfig, saveConfig } from '../config'
import { listAccounts, managementApiForAccount, createAccountProject } from '../supabase/accounts'
import { forgetSchedule } from '../scheduleState'
import { appendAudit } from '../audit'
import { getLogger } from '../logger'
import { emitToRenderer } from '../windowBus'
import { startRestore } from '../backup/backupService'
import { projectContext, requireAccount } from './context'
import type { ConnectionConfig } from '../../preload'
import type {
  CreateProjectInput,
  ManagedProject,
  OrganizationView,
  ProjectCapabilities,
  ProjectsOverview,
} from '../../shared/managerApi'

export function capabilitiesOf(c: ConnectionConfig): ProjectCapabilities {
  const account = !!c.accountId && !!c.projectRef
  const hasKey = !!c.supabase.url && !!c.supabase.serviceRoleKey
  return {
    sql: account || !!c.supabase.dbUrl?.trim(),
    auth: hasKey,
    storage: hasKey,
    lifecycle: account,
    secrets: account,
    functions: account,
    logs: account,
    migrations: account,
  }
}

/** Every configured project, with live status for the ones that belong to a reachable account. */
export async function listProjects(): Promise<ProjectsOverview> {
  const config = loadConfig()
  const accounts = new Map(listAccounts().map((a) => [a.id, a]))
  const statuses = new Map<string, { status: string; region: string }>()
  const accountErrors: ProjectsOverview['accountErrors'] = []

  const linked = [...new Set(config.connections.filter((c) => c.accountId && c.projectRef).map((c) => c.accountId!))]
  await Promise.all(
    linked.map(async (accountId) => {
      const account = accounts.get(accountId)
      try {
        const api = managementApiForAccount(accountId)
        if (!api) throw new Error('Account not found')
        for (const p of await api.listProjects()) statuses.set(p.ref, { status: p.status, region: p.region })
      } catch (err: any) {
        accountErrors.push({ accountId, accountName: account?.name ?? 'Account', error: err.message })
      }
    })
  )

  const projects: ManagedProject[] = config.connections
    // A project added in Settings but not filled in yet has nothing to manage.
    .filter((c) => c.supabase.url || c.supabase.dbUrl)
    .map((c) => {
      const live = c.projectRef ? statuses.get(c.projectRef) : undefined
      return {
        connectionId: c.id,
        name: c.name,
        url: c.supabase.url || undefined,
        accountId: c.accountId,
        accountName: c.accountId ? accounts.get(c.accountId)?.name : undefined,
        ref: c.projectRef,
        region: live?.region,
        status: live?.status,
        protected: !!c.protected,
        capabilities: capabilitiesOf(c),
      }
    })

  return { projects, accountErrors }
}

export function setProtected(connectionId: string, isProtected: boolean): void {
  const config = loadConfig()
  if (!config.connections.some((c) => c.id === connectionId)) throw new Error('Project not found.')
  saveConfig({
    ...config,
    connections: config.connections.map((c) => (c.id === connectionId ? { ...c, protected: isProtected } : c)),
  })
}

/** Stops managing a project in this app; nothing changes on Supabase. */
export function forgetProject(connectionId: string): void {
  const ctx = projectContext(connectionId)
  const config = loadConfig()
  saveConfig({ ...config, connections: config.connections.filter((c) => c.id !== connectionId) })
  forgetSchedule(connectionId)
  appendAudit({ action: 'project.forget', project: ctx.connection.name })
}

export async function pauseProject(connectionId: string): Promise<void> {
  const ctx = projectContext(connectionId)
  const { api, ref } = requireAccount(ctx, 'Pausing a project')
  await api.pauseProject(ref)
  appendAudit({ action: 'project.pause', project: ctx.connection.name, detail: ref })
}

export async function restoreProject(connectionId: string): Promise<void> {
  const ctx = projectContext(connectionId)
  const { api, ref } = requireAccount(ctx, 'Restoring a project')
  await api.restoreProject(ref)
  appendAudit({ action: 'project.restore', project: ctx.connection.name, detail: ref })
}

/** Deletes the project on Supabase and removes it from this app. Irreversible. */
export async function deleteProject(connectionId: string, confirmName: string): Promise<void> {
  const ctx = projectContext(connectionId)
  if (confirmName.trim() !== ctx.connection.name) throw new Error('The name you typed does not match the project name.')
  const { api, ref } = requireAccount(ctx, 'Deleting a project')

  await api.deleteProject(ref)
  appendAudit({ action: 'project.delete', project: ctx.connection.name, detail: ref })
  getLogger().warn(`Project deleted on Supabase: ${ctx.connection.name} (${ref})`)

  const config = loadConfig()
  saveConfig({ ...config, connections: config.connections.filter((c) => c.id !== connectionId) })
  forgetSchedule(connectionId)
}

export async function listOrganizations(accountId: string): Promise<OrganizationView[]> {
  const api = managementApiForAccount(accountId)
  if (!api) throw new Error('Account not found.')
  return (await api.listOrganizations()).map((o) => ({ id: o.id, slug: o.slug, name: o.name }))
}

export async function createProject(input: CreateProjectInput): Promise<{ ref: string; connectionId: string }> {
  const created = await createAccountProject(input)
  appendAudit({ action: 'project.create', project: input.name, detail: `${created.ref} (${input.region}, ${input.plan})` })
  return created
}

// ─── Clone: create a project, then restore a backup into it ───────────────────

const CLONE_POLL_MS = 6_000
const CLONE_GIVE_UP_MS = 25 * 60 * 1000

export interface CloneState {
  connectionId: string
  state: 'waiting' | 'restoring' | 'done' | 'failed'
  error?: string
  result?: { database: boolean; storageFiles: number; storageBuckets: number; warnings: string[] }
}

/**
 * Creates a project and restores a backup into it as soon as Supabase reports it ready. The call
 * returns right away; progress arrives through `clone:state` and the usual `restore:progress` events.
 */
export async function cloneFromBackup(
  input: CreateProjectInput & { filePath: string; scope: ('database' | 'storage')[]; password?: string }
): Promise<{ ref: string; connectionId: string }> {
  const { filePath, scope, password, ...create } = input
  const created = await createProject(create)
  void restoreWhenReady(created.connectionId, create.name, { filePath, scope, password })
  return created
}

async function restoreWhenReady(
  connectionId: string,
  name: string,
  options: { filePath: string; scope: ('database' | 'storage')[]; password?: string }
): Promise<void> {
  const logger = getLogger()
  const notify = (state: CloneState) => emitToRenderer('clone:state', state)
  notify({ connectionId, state: 'waiting' })

  const deadline = Date.now() + CLONE_GIVE_UP_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CLONE_POLL_MS))
    const connection = loadConfig().connections.find((c) => c.id === connectionId)
    if (!connection) return // the project was removed meanwhile
    if (!connection.supabase.serviceRoleKey || !connection.supabase.dbUrl) continue

    notify({ connectionId, state: 'restoring' })
    try {
      const result = await startRestore({ connectionId, filePath: options.filePath, scope: options.scope, password: options.password, confirmName: name }).promise
      notify({ connectionId, state: 'done', result })
    } catch (err: any) {
      logger.error(`Clone restore into "${name}" failed: ${err.message}`)
      notify({ connectionId, state: 'failed', error: err.message })
    }
    return
  }
  notify({ connectionId, state: 'failed', error: 'The new project did not become ready in time. Restore into it manually when it is healthy.' })
}
