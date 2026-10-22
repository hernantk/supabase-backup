import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { BackupProgress, BackupResult, BatchStartResult, JobInfo } from '../../electron/preload'

export interface JobView extends JobInfo {
  progress?: BackupProgress
  result?: BackupResult
}

export interface BatchView {
  batchId: string
  /** Oldest first, i.e. in the order the projects were queued. */
  jobs: JobView[]
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
  finished: boolean
  enqueuedAt: string
}

interface JobsContextType {
  /** Newest first. */
  jobs: JobView[]
  /** Jobs grouped by batch, newest batch first; jobs started alone are not included. */
  batches: BatchView[]
  activeCount: number
  runningCount: number
  queuedCount: number
  startBatch: (connectionIds: string[]) => Promise<BatchStartResult>
  cancelJob: (jobId: string) => Promise<void>
  cancelBatch: (batchId: string) => Promise<void>
  /** Hides finished jobs from the list; they stay in the backup history. */
  clearFinished: () => void
}

const JobsContext = createContext<JobsContextType | null>(null)

const isActive = (j: JobInfo) => j.state === 'queued' || j.state === 'running'

export function JobsProvider({ children }: { children: ReactNode }) {
  const [byId, setById] = useState<Record<string, JobView>>({})

  const upsert = useCallback((job: JobInfo, patch: Partial<JobView> = {}) => {
    setById((prev) => ({ ...prev, [job.id]: { ...prev[job.id], ...job, ...patch } }))
  }, [])

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .getJobs()
      .then((jobs) => {
        if (cancelled) return
        // Events that arrived before this snapshot are newer, so existing entries win.
        setById((prev) => {
          const next = { ...prev }
          for (const job of jobs) next[job.id] = { ...job, ...prev[job.id] }
          return next
        })
      })
      .catch(console.error)

    const unsubJobs = window.electronAPI.onJobEvent((event) => {
      if (event.type === 'job') upsert(event.job)
      else if (event.type === 'progress') upsert(event.job, { progress: event.progress })
    })
    const unsubDone = window.electronAPI.onBackupComplete((result) => {
      const jobId = result.jobId
      if (!jobId) return
      setById((prev) => (prev[jobId] ? { ...prev, [jobId]: { ...prev[jobId], result } } : prev))
    })
    return () => {
      cancelled = true
      unsubJobs()
      unsubDone()
    }
  }, [upsert])

  const jobs = useMemo(
    () => Object.values(byId).sort((a, b) => b.enqueuedAt.localeCompare(a.enqueuedAt)),
    [byId]
  )

  const batches = useMemo<BatchView[]>(() => {
    const groups = new Map<string, JobView[]>()
    for (const job of jobs) {
      if (!job.batchId) continue
      groups.set(job.batchId, [...(groups.get(job.batchId) ?? []), job])
    }
    return [...groups.entries()].map(([batchId, list]) => {
      const count = (state: JobInfo['state']) => list.filter((j) => j.state === state).length
      const queued = count('queued')
      const running = count('running')
      return {
        batchId,
        jobs: [...list].reverse(),
        total: list.length,
        queued,
        running,
        succeeded: count('succeeded'),
        failed: count('failed'),
        cancelled: count('cancelled'),
        finished: queued + running === 0,
        enqueuedAt: list[list.length - 1].enqueuedAt,
      }
    })
  }, [jobs])

  const startBatch = useCallback((ids: string[]) => window.electronAPI.runBackupBatch(ids), [])
  const cancelJob = useCallback(async (id: string) => {
    await window.electronAPI.cancelJob(id)
  }, [])
  const cancelBatch = useCallback(async (id: string) => {
    await window.electronAPI.cancelBatch(id)
  }, [])
  const clearFinished = useCallback(() => {
    setById((prev) => Object.fromEntries(Object.entries(prev).filter(([, j]) => isActive(j))))
  }, [])

  const runningCount = jobs.filter((j) => j.state === 'running').length
  const queuedCount = jobs.filter((j) => j.state === 'queued').length

  return (
    <JobsContext.Provider
      value={{
        jobs,
        batches,
        activeCount: runningCount + queuedCount,
        runningCount,
        queuedCount,
        startBatch,
        cancelJob,
        cancelBatch,
        clearFinished,
      }}
    >
      {children}
    </JobsContext.Provider>
  )
}

export function useJobs(): JobsContextType {
  const ctx = useContext(JobsContext)
  if (!ctx) throw new Error('useJobs must be used within a JobsProvider')
  return ctx
}
