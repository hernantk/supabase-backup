import { Client, type FieldDef, type QueryResult as PgResult } from 'pg'
import { toQueryResult } from '../../core/queryResult'
import type { QueryResult } from '../../shared/managerApi'

const CONNECT_TIMEOUT_MS = 15_000
const STATEMENT_TIMEOUT_MS = 120_000

function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

/**
 * Runs SQL over a direct connection (projects without an account). Read-only runs are wrapped in a
 * READ ONLY transaction so the database itself refuses writes, whatever the text looks like.
 */
export async function runPg(dbUrl: string, sql: string, readOnly: boolean): Promise<QueryResult> {
  const client = new Client({
    connectionString: dbUrl,
    // Supabase only accepts TLS. An explicit sslmode in the URL wins.
    ssl: /sslmode=/i.test(dbUrl) || isLocal(dbUrl) ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  })

  const started = Date.now()
  await client.connect()
  try {
    if (readOnly) await client.query('BEGIN READ ONLY')
    let outcome: PgResult | PgResult[]
    try {
      outcome = await client.query(sql)
    } finally {
      if (readOnly) await client.query('ROLLBACK').catch(() => undefined)
    }

    // Several statements come back as an array; the last result is the one worth showing.
    const last = Array.isArray(outcome) ? outcome[outcome.length - 1] : outcome
    const columns = (last.fields ?? []).map((f: FieldDef) => f.name)
    return toQueryResult((last.rows ?? []) as Record<string, unknown>[], Date.now() - started, columns)
  } finally {
    await client.end().catch(() => undefined)
  }
}
