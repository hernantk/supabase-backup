import { useMemo } from 'react'
import { useManagerQuery } from '../lib/api'
import type { ManagedProject, ProjectsOverview } from '../../electron/shared/managerApi'

export type StatusTone = 'ok' | 'warn' | 'busy' | 'off' | 'bad' | 'none'

const BUSY = new Set(['COMING_UP', 'GOING_DOWN', 'PAUSING', 'RESTORING', 'RESTARTING', 'UPGRADING', 'RESIZING'])
const BAD = new Set(['INIT_FAILED', 'RESTORE_FAILED', 'PAUSE_FAILED'])

export function statusTone(status?: string): StatusTone {
  if (!status) return 'none'
  if (status === 'ACTIVE_HEALTHY') return 'ok'
  if (status === 'ACTIVE_UNHEALTHY') return 'warn'
  if (status === 'INACTIVE') return 'off'
  if (BUSY.has(status)) return 'busy'
  if (BAD.has(status)) return 'bad'
  return 'none'
}

export const isPaused = (status?: string) => status === 'INACTIVE'

/** Project list with live status; polls faster while something is starting, pausing or restoring. */
export function useProjects() {
  const query = useManagerQuery('projects.list', undefined, {
    refetchInterval: (q) => {
      const data = q.state.data as ProjectsOverview | undefined
      return data?.projects.some((p) => statusTone(p.status) === 'busy') ? 5_000 : 60_000
    },
    staleTime: 10_000,
  })
  return query
}

export function useProject(connectionId: string | undefined): {
  project: ManagedProject | undefined
  isLoading: boolean
} {
  const { data, isLoading } = useProjects()
  const project = useMemo(() => data?.projects.find((p) => p.connectionId === connectionId), [data, connectionId])
  return { project, isLoading }
}

/** Groups projects for the sidebar and the list page: one group per account, standalone last. */
export function groupProjects(projects: ManagedProject[], standaloneLabel: string) {
  const groups = new Map<string, { key: string; label: string; items: ManagedProject[]; accountId?: string }>()
  for (const p of projects) {
    const key = p.accountId ?? '__standalone'
    const label = p.accountId ? (p.accountName ?? '—') : standaloneLabel
    if (!groups.has(key)) groups.set(key, { key, label, items: [], accountId: p.accountId })
    groups.get(key)!.items.push(p)
  }
  return [...groups.values()]
    .sort((a, b) => (a.accountId ? 0 : 1) - (b.accountId ? 0 : 1) || a.label.localeCompare(b.label))
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.name.localeCompare(b.name)) }))
}
