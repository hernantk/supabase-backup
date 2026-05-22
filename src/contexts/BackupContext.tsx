import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

interface BackupProgress {
  stage: 'database' | 'storage' | 'compress' | 'encrypt' | 'upload'
  progress: number
  message: string
}

interface BackupResult {
  id: string
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

export function BackupProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackupState>({
    isRunning: false,
    progress: null,
    result: null,
    error: null,
  })

  // Track calls to prevent stale closure issues
  const stateRef = useRef(state)
  stateRef.current = state

  // ── Listen for backup events globally ───────────────────────────────────────
  useEffect(() => {
    const unsubProgress = window.electronAPI.onBackupProgress((p) => {
      setState((prev) => ({ ...prev, progress: p }))
    })

    const unsubComplete = window.electronAPI.onBackupComplete((result) => {
      setState((prev) => ({
        ...prev,
        isRunning: false,
        result: result.success ? result : null,
        error: result.success ? null : (result.error ?? 'Backup failed'),
      }))
    })

    return () => { unsubProgress(); unsubComplete() }
  }, [])

  const startBackup = useCallback(async (
    connectionId: string,
    options: { include: ('database' | 'storage')[]; destinations: string[]; compress: boolean; encrypt: boolean }
  ): Promise<BackupResult> => {
    setState({ isRunning: true, progress: null, result: null, error: null })

    try {
      const result = await window.electronAPI.runBackup({ connectionId, ...options })
      setState((prev) => ({
        ...prev,
        isRunning: false,
        result: result.success ? result : null,
        error: result.success ? null : (result.error ?? 'Backup failed'),
      }))
      return result as any
    } catch (err: any) {
      setState({ isRunning: false, progress: null, result: null, error: err.message ?? 'Backup failed' })
      throw err
    }
  }, [])

  const cancelBackup = useCallback(async () => {
    await window.electronAPI.cancelBackup()
    setState({ isRunning: false, progress: null, result: null, error: 'Backup cancelled' })
  }, [])

  const clearState = useCallback(() => {
    setState({ isRunning: false, progress: null, result: null, error: null })
  }, [])

  return (
    <BackupContext.Provider value={{ ...state, startBackup, cancelBackup, clearState }}>
      {children}
    </BackupContext.Provider>
  )
}

export function useBackup(): BackupContextType {
  const ctx = useContext(BackupContext)
  if (!ctx) throw new Error('useBackup must be used within a BackupProvider')
  return ctx
}
