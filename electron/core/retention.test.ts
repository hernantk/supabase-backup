import { describe, it, expect } from 'vitest'
import { isUsablePolicy, selectBackupsToKeep } from './retention'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

describe('selectBackupsToKeep', () => {
  it('keeps the newest N when only keepLast is set', () => {
    const times = [at(2026, 1, 1), at(2026, 1, 2), at(2026, 1, 3), at(2026, 1, 4)]
    const keep = selectBackupsToKeep(times, { keepLast: 2 })
    expect([...keep].sort()).toEqual([at(2026, 1, 3), at(2026, 1, 4)].sort())
  })

  it('keeps one backup per day for the last D days, the newest of each day', () => {
    const times = [at(2026, 3, 10, 2), at(2026, 3, 10, 14), at(2026, 3, 9, 2), at(2026, 3, 9, 14), at(2026, 3, 8, 14)]
    const keep = selectBackupsToKeep(times, { keepLast: 0, keepDaily: 2 })
    expect(keep).toEqual(new Set([at(2026, 3, 10, 14), at(2026, 3, 9, 14)]))
  })

  it('keeps one per week, with weeks starting on Monday', () => {
    // 2026-03-02 is a Monday. Sat 7th and Mon 2nd share a week; Sun 1st belongs to the previous one.
    const times = [at(2026, 3, 7), at(2026, 3, 2), at(2026, 3, 1)]
    const keep = selectBackupsToKeep(times, { keepLast: 0, keepWeekly: 2 })
    expect(keep).toEqual(new Set([at(2026, 3, 7), at(2026, 3, 1)]))
  })

  it('keeps one per month', () => {
    const times = [at(2026, 3, 30), at(2026, 3, 1), at(2026, 2, 28), at(2026, 1, 15)]
    const keep = selectBackupsToKeep(times, { keepLast: 0, keepMonthly: 2 })
    expect(keep).toEqual(new Set([at(2026, 3, 30), at(2026, 2, 28)]))
  })

  it('layers add up without duplicates', () => {
    const times = Array.from({ length: 40 }, (_, i) => at(2026, 3, 1 + (i % 28), 1 + Math.floor(i / 28) * 10))
    const keep = selectBackupsToKeep(times, { keepLast: 3, keepDaily: 7, keepWeekly: 4, keepMonthly: 3 })
    expect(keep.size).toBeGreaterThanOrEqual(7)
    expect(keep.size).toBeLessThan(times.length)
    // The newest backup is always kept.
    expect(keep.has(Math.max(...times))).toBe(true)
  })

  it('skips days without backups instead of counting them', () => {
    const times = [at(2026, 3, 20), at(2026, 3, 1)]
    const keep = selectBackupsToKeep(times, { keepLast: 0, keepDaily: 2 })
    expect(keep).toEqual(new Set(times))
  })

  it('handles an empty list', () => {
    expect(selectBackupsToKeep([], { keepLast: 5 }).size).toBe(0)
  })
})

describe('isUsablePolicy', () => {
  it('requires at least one layer of 1 or more', () => {
    expect(isUsablePolicy({ keepLast: 0 })).toBe(false)
    expect(isUsablePolicy({ keepLast: 0, keepDaily: 0 })).toBe(false)
    expect(isUsablePolicy({ keepLast: 0, keepWeekly: 2 })).toBe(true)
    expect(isUsablePolicy({ keepLast: 7 })).toBe(true)
    expect(isUsablePolicy({ keepLast: NaN })).toBe(false)
  })
})
