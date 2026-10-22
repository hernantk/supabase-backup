/**
 * Contract between the renderer and the main process for the Manager features.
 * Types only: the renderer imports this file with `import type`, the main process validates every
 * payload with zod (see electron/ipc/managerRoutes.ts) before it reaches a service.
 */
import type { CellValue, FilterOp, RowFilter } from '../core/sqlBuilder'
import type { SqlKind } from '../core/sqlClassify'

export type { CellValue, FilterOp, RowFilter, SqlKind }

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface ProjectCapabilities {
  /** Run SQL: through the Management API (account) or a direct connection (database URL). */
  sql: boolean
  /** Auth users and Storage browser: need the project URL and a service-role key. */
  auth: boolean
  storage: boolean
  /** Everything below needs the project to belong to an account (personal access token). */
  lifecycle: boolean
  secrets: boolean
  functions: boolean
  logs: boolean
  migrations: boolean
}

export interface ManagedProject {
  connectionId: string
  name: string
  url?: string
  accountId?: string
  accountName?: string
  ref?: string
  region?: string
  /** Live status from the Management API, when the account could be reached. */
  status?: string
  protected: boolean
  capabilities: ProjectCapabilities
}

export interface ProjectsOverview {
  projects: ManagedProject[]
  /** Accounts whose project list could not be fetched (revoked token, offline, …). */
  accountErrors: { accountId: string; accountName: string; error: string }[]
}

export interface OrganizationView {
  id: string
  slug: string
  name: string
}

export interface CreateProjectInput {
  accountId: string
  name: string
  organizationSlug: string
  region: string
  dbPassword: string
  plan: 'free' | 'pro'
}

// ─── SQL & tables ─────────────────────────────────────────────────────────────

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
  /** More rows came back than the UI keeps. */
  truncated: boolean
}

export type SqlRunOutcome =
  | { status: 'ok'; kind: SqlKind; result: QueryResult }
  /** The project is protected and the statement is not a plain read: ask the user, then call again with `confirmed`. */
  | { status: 'confirm'; kind: SqlKind; reasons: string[] }

export interface TableInfo {
  schema: string
  name: string
  kind: 'table' | 'view' | 'materialized view' | 'foreign table'
  estimatedRows: number
  rls: boolean
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  default: string | null
  identity: boolean
  generated: boolean
  primaryKey: boolean
}

export interface TablePage {
  columns: ColumnInfo[]
  rows: Record<string, unknown>[]
  hasMore: boolean
}

export type MutationOutcome<T> = { status: 'ok'; value: T } | { status: 'confirm'; reasons: string[] }

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email?: string
  phone?: string
  createdAt: string
  lastSignInAt?: string
  confirmedAt?: string
  bannedUntil?: string
  providers: string[]
  isAnonymous: boolean
}

export interface AuthUsersPage {
  users: AuthUser[]
  page: number
  perPage: number
  total?: number
  hasMore: boolean
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export interface BucketView {
  id: string
  name: string
  public: boolean
  createdAt?: string
  fileSizeLimit?: number | null
}

export interface StorageEntry {
  name: string
  /** Full path inside the bucket. */
  path: string
  kind: 'folder' | 'file'
  size?: number
  mimeType?: string
  updatedAt?: string
}

// ─── Secrets & keys ───────────────────────────────────────────────────────────

export interface SecretView {
  name: string
  updatedAt?: string
}

export interface ApiKeyView {
  id: string
  name: string
  type: string
  /** Masked value, e.g. "sb_publishable_ab…". The full key is fetched on demand. */
  masked: string
}

// ─── Edge functions, logs, migrations, schema ─────────────────────────────────

export interface FunctionView {
  id: string
  slug: string
  name: string
  status: string
  version: number
  verifyJwt: boolean
  updatedAt?: string
}

export type LogSource = 'api' | 'postgres' | 'auth' | 'functions' | 'storage'

export interface LogRow {
  timestamp: string
  message: string
  level?: string
}

export interface MigrationView {
  version: string
  name?: string
}

export interface SchemaColumn {
  schema: string
  table: string
  column: string
  type: string
  nullable: boolean
  default: string | null
}

export type SchemaChange =
  | { kind: 'table-added' | 'table-removed'; schema: string; table: string }
  | { kind: 'column-added' | 'column-removed'; schema: string; table: string; column: string; type: string }
  | { kind: 'column-changed'; schema: string; table: string; column: string; from: string; to: string }

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  at: string
  action: string
  project?: string
  detail?: string
}

// ─── Method table ─────────────────────────────────────────────────────────────

type Project = { connectionId: string }

export interface ManagerApi {
  'projects.list': { in: void; out: ProjectsOverview }
  'projects.setProtected': { in: Project & { protected: boolean }; out: void }
  'projects.forget': { in: Project; out: void }
  'projects.pause': { in: Project; out: void }
  'projects.restore': { in: Project; out: void }
  'projects.delete': { in: Project & { confirmName: string }; out: void }
  'projects.create': { in: CreateProjectInput; out: { ref: string; connectionId: string } }
  'projects.cloneFromBackup': {
    in: CreateProjectInput & { filePath: string; scope: ('database' | 'storage')[]; password?: string }
    out: { ref: string; connectionId: string }
  }
  'accounts.organizations': { in: { accountId: string }; out: OrganizationView[] }

  'sql.run': { in: Project & { sql: string; readOnly: boolean; confirmed?: boolean }; out: SqlRunOutcome }

  'tables.list': { in: Project; out: TableInfo[] }
  'tables.rows': {
    in: Project & {
      schema: string
      table: string
      limit: number
      offset: number
      orderBy?: string
      descending?: boolean
      filter?: RowFilter
    }
    out: TablePage
  }
  'tables.update': {
    in: Project & { schema: string; table: string; match: Record<string, string | null>; set: Record<string, CellValue>; confirmed?: boolean }
    out: MutationOutcome<Record<string, unknown> | null>
  }
  'tables.insert': {
    in: Project & { schema: string; table: string; values: Record<string, CellValue>; confirmed?: boolean }
    out: MutationOutcome<Record<string, unknown> | null>
  }
  'tables.delete': {
    in: Project & { schema: string; table: string; match: Record<string, string | null>; confirmed?: boolean }
    out: MutationOutcome<number>
  }

  'auth.list': { in: Project & { page: number; perPage: number }; out: AuthUsersPage }
  'auth.create': { in: Project & { email: string; password: string; confirmEmail: boolean }; out: AuthUser }
  'auth.setBanned': { in: Project & { userId: string; banned: boolean }; out: void }
  'auth.delete': { in: Project & { userId: string }; out: void }

  'storage.buckets': { in: Project; out: BucketView[] }
  'storage.createBucket': { in: Project & { name: string; public: boolean }; out: void }
  'storage.deleteBucket': { in: Project & { name: string }; out: void }
  'storage.list': { in: Project & { bucket: string; prefix: string; search?: string }; out: StorageEntry[] }
  'storage.upload': { in: Project & { bucket: string; prefix: string }; out: { uploaded: number } }
  'storage.download': { in: Project & { bucket: string; path: string }; out: { savedTo: string | null } }
  'storage.delete': { in: Project & { bucket: string; paths: string[] }; out: void }
  'storage.url': { in: Project & { bucket: string; path: string; expiresIn: number }; out: { url: string; signed: boolean } }

  'secrets.list': { in: Project; out: SecretView[] }
  'secrets.set': { in: Project & { name: string; value: string }; out: void }
  'secrets.delete': { in: Project & { name: string }; out: void }
  'apiKeys.list': { in: Project; out: ApiKeyView[] }
  'apiKeys.reveal': { in: Project & { id: string }; out: { key: string } }

  'functions.list': { in: Project; out: FunctionView[] }
  'functions.download': { in: Project & { slug: string }; out: { savedTo: string | null } }
  'logs.query': { in: Project & { source: LogSource; hours: number; search?: string }; out: LogRow[] }
  'migrations.list': { in: Project; out: MigrationView[] }
  'schema.get': { in: Project; out: SchemaColumn[] }
  'schema.diff': { in: { left: string; right: string }; out: SchemaChange[] }

  'audit.list': { in: { limit: number }; out: AuditEntry[] }
}

export type ManagerMethod = keyof ManagerApi
