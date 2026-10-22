import { getPreviousCronRun } from '../services/cronNext'

export interface CatchUpInput {
  cron: string
  /** When a scheduled run of this project last fired. */
  lastFiredAt?: string | null
  /** Start of the last successful backup of this project, scheduled or manual. */
  lastSuccessAt?: string | null
  /** Since when the schedule has been tracked; nothing before it counts as missed. */
  trackedSince: string
  now: Date
  /** Occurrences older than this are skipped instead of caught up. */
  maxAgeMs: number
}

/**
 * Returns the scheduled time that was missed (the PC was off or asleep), or null when nothing
 * needs to run. Only the most recent occurrence counts: a week offline yields one backup, not seven.
 */
export function findMissedRun(input: CatchUpInput): Date | null {
  const due = getPreviousCronRun(input.cron, input.now)
  if (!due) return null

  const covered = Math.max(
    time(input.trackedSince),
    time(input.lastFiredAt),
    time(input.lastSuccessAt)
  )
  if (due.getTime() <= covered) return null
  if (input.now.getTime() - due.getTime() > input.maxAgeMs) return null
  return due
}

function time(iso?: string | null): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}
