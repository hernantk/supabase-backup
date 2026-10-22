export interface RetentionPolicy {
  /** Always keep this many of the newest backups. */
  keepLast: number
  /** Also keep the newest backup of each of the last N days that have one. */
  keepDaily?: number
  keepWeekly?: number
  keepMonthly?: number
}

/** Local-time bucket keys; a "week" starts on Monday. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function weekKey(d: Date): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return dayKey(monday)
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}`
}

function newestPerBucket(newestFirst: number[], keyOf: (d: Date) => string, buckets: number): number[] {
  if (!buckets || buckets < 1) return []
  const kept: number[] = []
  const seen = new Set<string>()
  for (const time of newestFirst) {
    const key = keyOf(new Date(time))
    if (seen.has(key)) continue
    if (seen.size >= buckets) break
    seen.add(key)
    kept.push(time)
  }
  return kept
}

/**
 * Decides which backups survive. Layers add up: the newest `keepLast`, plus the newest backup of each
 * of the last `keepDaily` days, `keepWeekly` weeks and `keepMonthly` months. Everything else goes.
 * Input and output are backup timestamps (ms since epoch).
 */
export function selectBackupsToKeep(times: number[], policy: RetentionPolicy): Set<number> {
  const newestFirst = [...times].sort((a, b) => b - a)
  const keep = new Set<number>()

  const last = Math.max(0, Math.floor(policy.keepLast || 0))
  for (const time of newestFirst.slice(0, last)) keep.add(time)

  for (const time of newestPerBucket(newestFirst, dayKey, Math.floor(policy.keepDaily || 0))) keep.add(time)
  for (const time of newestPerBucket(newestFirst, weekKey, Math.floor(policy.keepWeekly || 0))) keep.add(time)
  for (const time of newestPerBucket(newestFirst, monthKey, Math.floor(policy.keepMonthly || 0))) keep.add(time)
  return keep
}

/** True when the policy would keep anything at all (guards against wiping every backup by mistake). */
export function isUsablePolicy(policy: RetentionPolicy): boolean {
  return [policy.keepLast, policy.keepDaily, policy.keepWeekly, policy.keepMonthly].some((n) => Number.isFinite(n) && (n as number) >= 1)
}
