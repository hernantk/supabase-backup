import { Client, type FieldDef, type QueryResult as PgResult } from 'pg'
import { toQueryResult } from '../../core/queryResult'
import { isTlsRefusal, shouldTryTlsFirst } from '../../core/pgSsl'
import type { QueryResult } from '../../shared/managerApi'

const CONNECT_TIMEOUT_MS = 15_000
const STATEMENT_TIMEOUT_MS = 120_000

function newClient(dbUrl: string, tls: boolean): Client {
  return new Client({
    connectionString: dbUrl,
    ssl: tls ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  })
}

/**
 * Connects with TLS first (Supabase only accepts it) and, when the server says it has no TLS support,
 * as self-hosted Postgres often does, once more without. Only the connection step is retried, so a
 * statement is never executed twice.
 */
async function connect(dbUrl: string): Promise<Client> {
  const tryTls = shouldTryTlsFirst(dbUrl)
  const first = newClient(dbUrl, tryTls)
  try {
    await first.connect()
    return first
  } catch (err) {
    await first.end().catch(() => undefined)
    if (!tryTls || !isTlsRefusal(err)) throw err
  }
  const plain = newClient(dbUrl, false)
  await plain.connect()
  return plain
}

/**
 * Runs SQL over a direct connection (projects without an account). Read-only runs are wrapped in a
 * READ ONLY transaction so the database itself refuses writes, whatever the text looks like.
 */
export async function runPg(dbUrl: string, sql: string, readOnly: boolean): Promise<QueryResult> {
  const started = Date.now()
  const client = await connect(dbUrl)
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
