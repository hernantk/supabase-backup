import { describe, it, expect } from 'vitest'
import { findMissedRun } from './catchUp'
import { getPreviousCronRun } from '../services/cronNext'

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0)
const DAY = 24 * 60 * 60 * 1000

describe('getPreviousCronRun', () => {
  it('finds the latest daily occurrence at or before the reference', () => {
    expect(getPreviousCronRun('0 2 * * *', local(2026, 10, 22, 9, 30))).toEqual(local(2026, 10, 22, 2))
    expect(getPreviousCronRun('0 2 * * *', local(2026, 10, 22, 1, 0))).toEqual(local(2026, 10, 21, 2))
  })

  it('includes the reference instant itself', () => {
    expect(getPreviousCronRun('0 2 * * *', local(2026, 10, 22, 2, 0))).toEqual(local(2026, 10, 22, 2))
  })

  it('handles weekday and step expressions', () => {
    // 2026-10-22 is a Thursday; the previous Monday 02:00 is the 19th.
    expect(getPreviousCronRun('0 2 * * 1', local(2026, 10, 22, 12))).toEqual(local(2026, 10, 19, 2))
    expect(getPreviousCronRun('0 */6 * * *', local(2026, 10, 22, 13, 15))).toEqual(local(2026, 10, 22, 12))
  })

  it('returns null for an invalid expression', () => {
    expect(getPreviousCronRun('nope')).toBeNull()
  })
})

describe('findMissedRun', () => {
  const base = { cron: '0 2 * * *', maxAgeMs: DAY, trackedSince: local(2026, 10, 1).toISOString() }

  it('reports the occurrence missed while the PC was off', () => {
    const missed = findMissedRun({
      ...base,
      lastFiredAt: local(2026, 10, 21, 2).toISOString(),
      now: local(2026, 10, 22, 9),
    })
    expect(missed).toEqual(local(2026, 10, 22, 2))
  })

  it('reports nothing when the last occurrence already fired', () => {
    expect(
      findMissedRun({ ...base, lastFiredAt: local(2026, 10, 22, 2).toISOString(), now: local(2026, 10, 22, 9) })
    ).toBeNull()
  })

  it('treats a manual successful backup after the due time as covering it', () => {
    expect(
      findMissedRun({
        ...base,
        lastFiredAt: local(2026, 10, 21, 2).toISOString(),
        lastSuccessAt: local(2026, 10, 22, 7).toISOString(),
        now: local(2026, 10, 22, 9),
      })
    ).toBeNull()
  })

  it('does not count occurrences from before the schedule was tracked', () => {
    expect(
      findMissedRun({ ...base, trackedSince: local(2026, 10, 22, 5).toISOString(), now: local(2026, 10, 22, 9) })
    ).toBeNull()
  })

  it('skips an occurrence older than the max age', () => {
    expect(
      findMissedRun({
        ...base,
        lastFiredAt: local(2026, 10, 1, 2).toISOString(),
        now: local(2026, 10, 22, 1),
        maxAgeMs: 3 * 60 * 60 * 1000,
      })
    ).toBeNull()
  })

  it('collapses several missed days into a single catch-up', () => {
    const missed = findMissedRun({
      ...base,
      maxAgeMs: 30 * DAY,
      lastFiredAt: local(2026, 10, 10, 2).toISOString(),
      now: local(2026, 10, 22, 9),
    })
    expect(missed).toEqual(local(2026, 10, 22, 2))
  })
})
