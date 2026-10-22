import type { QueryResult } from '../shared/managerApi'

/** Rows kept for the UI; beyond this the result is flagged as truncated. */
export const MAX_ROWS = 5000

/** Makes a driver value safe to send over IPC and to render. */
export function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return `\\x${Buffer.from(value).toString('hex')}`
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeValue(v)]))
  }
  return value
}

export function toQueryResult(
  rows: Record<string, unknown>[],
  durationMs: number,
  columnHint?: string[]
): QueryResult {
  const kept = rows.slice(0, MAX_ROWS).map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, normalizeValue(v)]))
  )
  const columns = columnHint && columnHint.length > 0 ? columnHint : orderedColumns(kept)
  return { columns, rows: kept, rowCount: rows.length, durationMs, truncated: rows.length > MAX_ROWS }
}

/** Column order of the first row, followed by keys that only appear later. */
function orderedColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>()
  for (const row of rows.slice(0, 50)) for (const key of Object.keys(row)) seen.add(key)
  return [...seen]
}
