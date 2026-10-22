import { loadConfig, saveConfig } from '../config'
import { listAccounts, managementApiForAccount, createAccountProject } from '../supabase/accounts'
import { forgetSchedule } from '../scheduleState'
import { appendAudit } from '../audit'
import { getLogger } from '../logger'
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
    // The untouched first-launch placeholder is noise once real projects exist.
    .filter((c) => c.supabase.url || c.supabase.dbUrl || config.connections.length === 1)
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
