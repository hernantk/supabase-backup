import { describe, it, expect } from 'vitest'
import { MAX_ROWS, normalizeValue, toQueryResult } from './queryResult'

describe('normalizeValue', () => {
  it('turns driver-specific values into plain JSON', () => {
    expect(normalizeValue(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z')
    expect(normalizeValue(10n)).toBe('10')
    expect(normalizeValue(new Uint8Array([0, 255]))).toBe('\\x00ff')
    expect(normalizeValue(undefined)).toBeNull()
    expect(normalizeValue({ a: [1n, new Date(0)] })).toEqual({ a: ['1', '1970-01-01T00:00:00.000Z'] })
  })

  it('maps an invalid date to null instead of throwing', () => {
    expect(normalizeValue(new Date('nope'))).toBeNull()
  })
})

describe('toQueryResult', () => {
  it('keeps the column order of the first row and adds late columns', () => {
    const result = toQueryResult([{ b: 1, a: 2 }, { b: 3, a: 4, c: 5 }], 12)
    expect(result.columns).toEqual(['b', 'a', 'c'])
    expect(result.rowCount).toBe(2)
    expect(result.durationMs).toBe(12)
    expect(result.truncated).toBe(false)
  })

  it('prefers the driver-provided columns, which survive an empty result', () => {
    expect(toQueryResult([], 1, ['id', 'name']).columns).toEqual(['id', 'name'])
  })

  it('truncates very large results but reports the real row count', () => {
    const rows = Array.from({ length: MAX_ROWS + 10 }, (_, i) => ({ i }))
    const result = toQueryResult(rows, 1)
    expect(result.rows).toHaveLength(MAX_ROWS)
    expect(result.rowCount).toBe(MAX_ROWS + 10)
    expect(result.truncated).toBe(true)
  })
})
