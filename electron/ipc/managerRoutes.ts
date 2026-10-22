import { ipcMain } from 'electron'
import { z } from 'zod'
import type { ManagerApi, ManagerMethod } from '../shared/managerApi'
import { listAudit } from '../services/audit'
import { loadConfig } from '../services/config'
import { syncSchedules } from '../services/scheduler'
import * as projects from '../services/manager/projects'
import { runSql } from '../services/manager/sql'
import * as tables from '../services/manager/tables'
import * as authUsers from '../services/manager/authUsers'
import * as storage from '../services/manager/storageBrowser'
import * as secrets from '../services/manager/secrets'
import * as insights from '../services/manager/insights'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const project = z.object({ connectionId: z.string().min(1) })
const identifier = z.string().min(1).max(256)
const match = z.record(z.string().nullable())
const cellValue = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('null') }),
  z.object({ kind: z.literal('default') }),
  z.object({ kind: z.literal('text'), value: z.string().max(1_000_000) }),
])
const filter = z.object({
  column: identifier,
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'isnull', 'notnull']),
  value: z.string().max(10_000).optional(),
})

type Route<K extends ManagerMethod> = {
  schema: z.ZodType<ManagerApi[K]['in'], z.ZodTypeDef, unknown>
  run: (input: ManagerApi[K]['in']) => Promise<ManagerApi[K]['out']> | ManagerApi[K]['out']
}

function route<K extends ManagerMethod>(
  schema: Route<K>['schema'],
  run: Route<K>['run']
): Route<K> {
  return { schema, run }
}

function resync() {
  syncSchedules(loadConfig())
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const routes: { [K in ManagerMethod]?: Route<K> } = {
  'projects.list': route(z.undefined(), () => projects.listProjects()),
  'projects.setProtected': route(project.extend({ protected: z.boolean() }), (i) => projects.setProtected(i.connectionId, i.protected)),
  'projects.forget': route(project, (i) => {
    projects.forgetProject(i.connectionId)
    resync()
  }),
  'projects.pause': route(project, (i) => projects.pauseProject(i.connectionId)),
  'projects.restore': route(project, (i) => projects.restoreProject(i.connectionId)),
  'projects.delete': route(project.extend({ confirmName: z.string() }), async (i) => {
    await projects.deleteProject(i.connectionId, i.confirmName)
    resync()
  }),
  'projects.create': route(
    z.object({
      accountId: z.string().min(1),
      name: z.string().trim().min(1).max(64),
      organizationSlug: z.string().min(1),
      region: z.string().min(1),
      dbPassword: z.string().min(8).max(200),
      plan: z.enum(['free', 'pro']),
    }),
    (i) => projects.createProject(i)
  ),
  'projects.cloneFromBackup': route(
    z.object({
      accountId: z.string().min(1),
      name: z.string().trim().min(1).max(64),
      organizationSlug: z.string().min(1),
      region: z.string().min(1),
      dbPassword: z.string().min(8).max(200),
      plan: z.enum(['free', 'pro']),
      filePath: z.string().min(1),
      scope: z.array(z.enum(['database', 'storage'])).min(1),
      password: z.string().optional(),
    }),
    (i) => projects.cloneFromBackup(i)
  ),
  'accounts.organizations': route(z.object({ accountId: z.string().min(1) }), (i) => projects.listOrganizations(i.accountId)),

  'sql.run': route(
    project.extend({ sql: z.string().min(1).max(2_000_000), readOnly: z.boolean(), confirmed: z.boolean().optional() }),
    (i) => runSql(i)
  ),

  'tables.list': route(project, (i) => tables.listTables(i.connectionId)),
  'tables.rows': route(
    project.extend({
      schema: identifier,
      table: identifier,
      limit: z.number().int().min(1).max(500),
      offset: z.number().int().min(0),
      orderBy: identifier.optional(),
      descending: z.boolean().optional(),
      filter: filter.optional(),
    }),
    (i) => tables.readRows(i)
  ),
  'tables.update': route(
    project.extend({ schema: identifier, table: identifier, match, set: z.record(cellValue), confirmed: z.boolean().optional() }),
    (i) => tables.updateRow(i)
  ),
  'tables.insert': route(
    project.extend({ schema: identifier, table: identifier, values: z.record(cellValue), confirmed: z.boolean().optional() }),
    (i) => tables.insertRow(i)
  ),
  'tables.delete': route(
    project.extend({ schema: identifier, table: identifier, match, confirmed: z.boolean().optional() }),
    (i) => tables.deleteRow(i)
  ),

  'auth.list': route(project.extend({ page: z.number().int().min(1), perPage: z.number().int().min(1).max(200) }), (i) =>
    authUsers.listUsers(i.connectionId, i.page, i.perPage)
  ),
  'auth.create': route(
    project.extend({ email: z.string().email(), password: z.string().min(6).max(200), confirmEmail: z.boolean() }),
    (i) => authUsers.createUser(i.connectionId, i.email, i.password, i.confirmEmail)
  ),
  'auth.setBanned': route(project.extend({ userId: z.string().min(1), banned: z.boolean() }), (i) =>
    authUsers.setBanned(i.connectionId, i.userId, i.banned)
  ),
  'auth.delete': route(project.extend({ userId: z.string().min(1) }), (i) => authUsers.deleteUser(i.connectionId, i.userId)),

  'storage.buckets': route(project, (i) => storage.listBuckets(i.connectionId)),
  'storage.createBucket': route(project.extend({ name: z.string().min(1).max(100), public: z.boolean() }), (i) =>
    storage.createBucket(i.connectionId, i.name, i.public)
  ),
  'storage.deleteBucket': route(project.extend({ name: z.string().min(1) }), (i) => storage.deleteBucket(i.connectionId, i.name)),
  'storage.list': route(
    project.extend({ bucket: z.string().min(1), prefix: z.string().max(1024), search: z.string().max(200).optional() }),
    (i) => storage.listObjects(i.connectionId, i.bucket, i.prefix, i.search)
  ),
  'storage.upload': route(project.extend({ bucket: z.string().min(1), prefix: z.string().max(1024) }), (i) =>
    storage.uploadFiles(i.connectionId, i.bucket, i.prefix)
  ),
  'storage.download': route(project.extend({ bucket: z.string().min(1), path: z.string().min(1).max(1024) }), (i) =>
    storage.downloadObject(i.connectionId, i.bucket, i.path)
  ),
  'storage.delete': route(project.extend({ bucket: z.string().min(1), paths: z.array(z.string().min(1)).min(1).max(1000) }), (i) =>
    storage.deleteObjects(i.connectionId, i.bucket, i.paths)
  ),
  'storage.url': route(
    project.extend({ bucket: z.string().min(1), path: z.string().min(1), expiresIn: z.number().int().min(60).max(604_800) }),
    (i) => storage.objectUrl(i.connectionId, i.bucket, i.path, i.expiresIn)
  ),

  'secrets.list': route(project, (i) => secrets.listSecrets(i.connectionId)),
  'secrets.set': route(
    project.extend({ name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, digits and underscores').max(128), value: z.string().min(1).max(100_000) }),
    (i) => secrets.setSecret(i.connectionId, i.name, i.value)
  ),
  'secrets.delete': route(project.extend({ name: z.string().min(1) }), (i) => secrets.deleteSecret(i.connectionId, i.name)),
  'apiKeys.list': route(project, (i) => secrets.listApiKeys(i.connectionId)),
  'apiKeys.reveal': route(project.extend({ id: z.string().min(1) }), (i) => secrets.revealApiKey(i.connectionId, i.id)),

  'functions.list': route(project, (i) => insights.listFunctions(i.connectionId)),
  'functions.download': route(project.extend({ slug: z.string().min(1).max(128) }), (i) => insights.downloadFunction(i.connectionId, i.slug)),
  'logs.query': route(
    project.extend({
      source: z.enum(['api', 'postgres', 'auth', 'functions', 'storage']),
      hours: z.number().int().min(1).max(24),
      search: z.string().max(200).optional(),
    }),
    (i) => insights.queryLogs(i.connectionId, i.source, i.hours, i.search)
  ),
  'migrations.list': route(project, (i) => insights.listMigrations(i.connectionId)),
  'schema.get': route(project, (i) => insights.getSchema(i.connectionId)),
  'schema.diff': route(z.object({ left: z.string().min(1), right: z.string().min(1) }), (i) => insights.compareSchemas(i.left, i.right)),

  'audit.list': route(z.object({ limit: z.number().int().min(1).max(1000) }), (i) => listAudit(i.limit)),
}

export function registerManagerRoutes(extra: { [K in ManagerMethod]?: Route<K> } = {}): void {
  const all = { ...routes, ...extra } as Record<string, Route<ManagerMethod> | undefined>

  ipcMain.handle('manager:call', async (_event, method: string, payload: unknown) => {
    const entry = all[method]
    if (!entry) throw new Error(`Unknown manager method: ${method}`)

    const parsed = entry.schema.safeParse(payload)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new Error(`Invalid request (${issue.path.join('.') || 'payload'}): ${issue.message}`)
    }
    return entry.run(parsed.data as never)
  })
}

export { route, resync }
export type { Route }
