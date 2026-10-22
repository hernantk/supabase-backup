/** Subset of GET /v1/projects/{ref}/config/database/pooler that we need. */
export interface PoolerConfig {
  db_user: string
  db_host: string
  db_port?: number
  db_name: string
  pool_mode?: 'transaction' | 'session'
}

const SESSION_PORT = 5432

function build(user: string, password: string, host: string, port: number, db: string): string {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(db)}`
}

/**
 * Session-mode pooler URL. Supavisor serves session mode on 5432 of the same host that serves
 * transaction mode on 6543, and pg_dump needs session mode (prepared statements, SET commands).
 */
export function buildPoolerSessionUrl(pooler: PoolerConfig, password: string): string {
  return build(pooler.db_user, password, pooler.db_host, SESSION_PORT, pooler.db_name)
}

/** Direct connection. IPv6-only unless the project has the IPv4 add-on. */
export function buildDirectUrl(projectRef: string, password: string): string {
  return build('postgres', password, `db.${projectRef}.supabase.co`, 5432, 'postgres')
}

/** Picks the primary pooler entry from the API's list (read replicas are ignored). */
export function pickPrimaryPooler<T extends { database_type?: string }>(poolers: T[]): T | undefined {
  return poolers.find((p) => p.database_type === 'PRIMARY') ?? poolers[0]
}

export interface ApiKeyInfo {
  id?: string
  type?: 'legacy' | 'publishable' | 'secret' | null
  name: string
  api_key?: string | null
}

/**
 * Chooses the key used for Storage access: the legacy `service_role` JWT when present (works
 * everywhere supabase-js does), otherwise the first `secret` key.
 */
export function pickServiceKey(keys: ApiKeyInfo[]): string | undefined {
  const withValue = keys.filter((k) => k.api_key)
  const legacy = withValue.find((k) => k.name === 'service_role')
  if (legacy) return legacy.api_key!
  return withValue.find((k) => k.type === 'secret')?.api_key ?? undefined
}
