import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useJobs } from './JobsContext'

interface BackupProgress {
  stage: 'database' | 'storage' | 'compress' | 'encrypt' | 'upload'
  progress: number
  message: string
}

interface BackupResult {
  id: string
  connectionId?: string
  success: boolean
  error?: string
  timestamp: string
  duration: number
  size: number
  destinations: string[]
  localPath?: string
}

interface BackupState {
  isRunning: boolean
  progress: BackupProgress | null
  result: BackupResult | null
  error: string | null
}

interface BackupContextType extends BackupState {
  startBackup: (connectionId: string, options: {
    include: ('database' | 'storage')[]
    destinations: string[]
    compress: boolean
    encrypt: boolean
  }) => Promise<BackupResult>
  cancelBackup: () => Promise<void>
  clearState: () => void
}

const BackupContext = createContext<BackupContextType | null>(null)

/**
 * Single-backup view used by the Run Backup page. Several backups can run at once, so it follows
 * the project the user started (or, when idle, whichever backup is running) and ignores the rest.
 */
export function BackupProvider({ children }: { children: ReactNode }) {
  const { jobs, cancelJob } = useJobs()
  const [starting, setStarting] = useState(false)
  const [outcome, setOutcome] = useState<{ result: BackupResult | null; error: string | null }>({
    result: null,
    error: null,
  })
  const trackedRef = useRef<string | null>(null)

  const current = useMemo(() => {
    const active = jobs.filter((j) => j.state === 'queued' || j.state === 'running')
    const tracked = trackedRef.current
    if (tracked) return active.find((j) => j.key === tracked)
    return active.find((j) => j.state === 'running') ?? active[0]
  }, [jobs, starting])

  useEffect(() => {
    return window.electronAPI.onBackupComplete((result) => {
      const tracked = trackedRef.current
      if (tracked && result.connectionId !== tracked) return
      setOutcome({
        result: result.success ? (result as BackupResult) : null,
        error: result.success ? null : (result.error ?? 'Backup failed'),
      })
    })
  }, [])

  const startBackup = useCallback(
    async (
      connectionId: string,
      options: { include: ('database' | 'storage')[]; destinations: string[]; compress: boolean; encrypt: boolean }
    ): Promise<BackupResult> => {
      trackedRef.current = connectionId
      setOutcome({ result: null, error: null })
      setStarting(true)

      try {
        const result = await window.electronAPI.runBackup({ connectionId, ...options })
        setOutcome({
          result: result.success ? (result as BackupResult) : null,
          error: result.success ? null : (result.error ?? 'Backup failed'),
        })
        return result as BackupResult
      } catch (err: any) {
        setOutcome({ result: null, error: err.message ?? 'Backup failed' })
        throw err
      } finally {
        trackedRef.current = null
        setStarting(false)
      }
    },
    []
  )

  const cancelBackup = useCallback(async () => {
    if (current) await cancelJob(current.id)
    else await window.electronAPI.cancelBackup()
    setOutcome({ result: null, error: 'Backup cancelled' })
  }, [current, cancelJob])

  const clearState = useCallback(() => setOutcome({ result: null, error: null }), [])

  const value: BackupContextType = {
    isRunning: starting || !!current,
    progress: current?.progress ?? null,
    result: outcome.result,
    error: outcome.error,
    startBackup,
    cancelBackup,
    clearState,
  }

  return <BackupContext.Provider value={value}>{children}</BackupContext.Provider>
}

export function useBackup(): BackupContextType {
  const ctx = useContext(BackupContext)
  if (!ctx) throw new Error('useBackup must be used within a BackupProvider')
  return ctx
}
