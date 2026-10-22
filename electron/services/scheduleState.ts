import { getStore, type ScheduleStateEntry } from './config'

function read(): Record<string, ScheduleStateEntry> {
  return getStore().get('scheduleState', {}) as Record<string, ScheduleStateEntry>
}

export function getScheduleState(connectionId: string): ScheduleStateEntry | undefined {
  return read()[connectionId]
}

/** Starts tracking a schedule the first time it is seen; earlier occurrences never count as missed. */
export function ensureTracked(connectionId: string, now: Date = new Date()): ScheduleStateEntry {
  const all = read()
  const existing = all[connectionId]
  if (existing) return existing
  const entry = { trackedSince: now.toISOString() }
  getStore().set('scheduleState', { ...all, [connectionId]: entry })
  return entry
}

export function recordFired(connectionId: string, at: Date = new Date()): void {
  const all = read()
  const entry = all[connectionId] ?? { trackedSince: at.toISOString() }
  getStore().set('scheduleState', { ...all, [connectionId]: { ...entry, lastFiredAt: at.toISOString() } })
}

export function forgetSchedule(connectionId: string): void {
  const { [connectionId]: _removed, ...rest } = read()
  getStore().set('scheduleState', rest)
}
