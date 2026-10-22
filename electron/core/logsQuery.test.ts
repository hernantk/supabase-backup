import { describe, it, expect } from 'vitest'
import { logsSql, logWindow, normalizeLogRows, normalizeTimestamp } from './logsQuery'

describe('logsSql', () => {
  it('queries the collection for the source, newest first, with a clamped limit', () => {
    expect(logsSql('api')).toBe('select timestamp, event_message from edge_logs order by timestamp desc limit 300')
    expect(logsSql('postgres', 99999)).toContain('postgres_logs')
    expect(logsSql('postgres', 99999)).toContain('limit 1000')
    expect(logsSql('functions', 0)).toContain('limit 1')
  })
})

describe('logWindow', () => {
  const now = new Date('2026-10-22T12:00:00.000Z')

  it('covers the requested hours', () => {
    expect(logWindow(1, now)).toEqual({ start: '2026-10-22T11:00:00.000Z', end: '2026-10-22T12:00:00.000Z' })
  })

  it('never exceeds the 24 hours the API allows, nor goes below one hour', () => {
    expect(logWindow(72, now).start).toBe('2026-10-21T12:00:00.000Z')
    expect(logWindow(0, now).start).toBe('2026-10-22T11:00:00.000Z')
  })
})

describe('normalizeTimestamp', () => {
  it('converts microseconds, milliseconds, numeric strings and ISO strings', () => {
    expect(normalizeTimestamp(1_760_000_000_000_000)).toBe('2025-10-09T08:53:20.000Z')
    expect(normalizeTimestamp(1_760_000_000_000)).toBe('2025-10-09T08:53:20.000Z')
    expect(normalizeTimestamp('1760000000000000')).toBe('2025-10-09T08:53:20.000Z')
    expect(normalizeTimestamp('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05.000Z')
  })

  it('falls back to the epoch instead of throwing on garbage', () => {
    expect(normalizeTimestamp('nope')).toBe('1970-01-01T00:00:00.000Z')
    expect(normalizeTimestamp(undefined)).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('normalizeLogRows', () => {
  const rows = [
    { timestamp: 1_760_000_000_000_000, event_message: 'GET /rest/v1/users 200' },
    { timestamp: 1_760_000_001_000_000, event_message: 'connection received' },
  ]

  it('maps rows and tolerates a missing result', () => {
    expect(normalizeLogRows(rows)).toHaveLength(2)
    expect(normalizeLogRows(undefined)).toEqual([])
  })

  it('filters by a case-insensitive search', () => {
    const found = normalizeLogRows(rows, 'REST')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('/rest/v1/users')
  })
})
