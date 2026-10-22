import type { LogRow, LogSource } from '../shared/managerApi'

/** Logs Explorer collection behind each source. */
const COLLECTIONS: Record<LogSource, string> = {
  api: 'edge_logs',
  postgres: 'postgres_logs',
  auth: 'auth_logs',
  functions: 'function_logs',
  storage: 'storage_logs',
}

export const LOG_SOURCES = Object.keys(COLLECTIONS) as LogSource[]

/** The Management API only accepts windows of up to 24 hours. */
export const MAX_LOG_HOURS = 24

export function logsSql(source: LogSource, limit = 300): string {
  return `select timestamp, event_message from ${COLLECTIONS[source]} order by timestamp desc limit ${Math.max(1, Math.min(1000, limit))}`
}

export function logWindow(hours: number, now: Date = new Date()): { start: string; end: string } {
  const span = Math.max(1, Math.min(MAX_LOG_HOURS, Math.floor(hours))) * 60 * 60 * 1000
  return { start: new Date(now.getTime() - span).toISOString(), end: now.toISOString() }
}

/** Log timestamps arrive as microseconds since the epoch (or, sometimes, as ISO strings). */
export function normalizeTimestamp(value: unknown): string {
  if (typeof value === 'number') {
    const ms = value > 1e14 ? value / 1000 : value
    return new Date(ms).toISOString()
  }
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber) && value.trim() !== '') return normalizeTimestamp(asNumber)
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date(0).toISOString()
}

export function normalizeLogRows(rows: unknown[] | undefined, search?: string): LogRow[] {
  const needle = search?.trim().toLowerCase()
  return (rows ?? [])
    .map((row) => {
      const r = row as Record<string, unknown>
      return { timestamp: normalizeTimestamp(r.timestamp), message: String(r.event_message ?? '') }
    })
    .filter((r) => !needle || r.message.toLowerCase().includes(needle))
}
