import { useState, useEffect } from 'react'
import {
  PlayCircle,
  StopCircle,
  Database,
  FolderOpen,
  Cloud,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { ProgressBar } from '../components/ProgressBar'

type BackupStage = 'database' | 'storage' | 'compress' | 'encrypt' | 'upload'

interface BackupProgress {
  stage: BackupStage
  progress: number
  message: string
}

interface BackupOptions {
  include: ('database' | 'storage')[]
  destinations: string[]
  compress: boolean
  encrypt: boolean
}

const stages: { key: BackupStage; label: string }[] = [
  { key: 'database', label: 'Database Dump' },
  { key: 'storage', label: 'Storage Download' },
  { key: 'compress', label: 'Compression' },
  { key: 'encrypt', label: 'Encryption' },
  { key: 'upload', label: 'Upload' },
]

export function RunBackup() {
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [options, setOptions] = useState<BackupOptions>({
    include: ['database', 'storage'],
    destinations: ['local'],
    compress: true,
    encrypt: false,
  })
  const [config, setConfig] = useState<any>(null)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    loadConfig()

    const unsubProgress = window.electronAPI.onBackupProgress((p) => {
      setProgress(p)
      setLogs((prev) => [...prev, `[${p.stage}] ${p.message}`])
    })

    const unsubComplete = window.electronAPI.onBackupComplete((result) => {
      setIsRunning(false)
      if (result.success) {
        setIsComplete(true)
      } else {
        setError(result.error || 'Unknown error')
      }
    })

    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [])

  async function loadConfig() {
    const cfg = await window.electronAPI.getConfig()
    setConfig(cfg)

    // Set defaults from config
    setOptions((prev) => ({
      ...prev,
      include: cfg.backup.include,
      compress: cfg.backup.compress,
      encrypt: cfg.backup.encrypt,
      destinations: getEnabledDestinations(cfg),
    }))
  }

  function getEnabledDestinations(cfg: any): string[] {
    const dests: string[] = []
    if (cfg.destinations.local.enabled) dests.push('local')
    if (cfg.destinations.s3.enabled) dests.push('s3')
    if (cfg.destinations.gcs.enabled) dests.push('gcs')
    if (cfg.destinations.azure.enabled) dests.push('azure')
    return dests.length > 0 ? dests : ['local']
  }

  async function handleStart() {
    setIsRunning(true)
    setIsComplete(false)
    setError(null)
    setProgress(null)
    setLogs([])

    try {
      const result = await window.electronAPI.runBackup(options)
      setIsRunning(false)
      if (result.success) {
        setIsComplete(true)
      } else {
        setError(result.error || 'Backup failed')
      }
    } catch (err: any) {
      setIsRunning(false)
      setError(err.message || 'Backup failed')
    }
  }

  async function handleCancel() {
    await window.electronAPI.cancelBackup()
    setIsRunning(false)
    setError('Backup cancelled by user')
  }

  function toggleInclude(type: 'database' | 'storage') {
    setOptions((prev) => {
      const includes = prev.include.includes(type)
        ? prev.include.filter((t) => t !== type)
        : [...prev.include, type]
      return { ...prev, include: includes.length > 0 ? includes : prev.include }
    })
  }

  function toggleDestination(dest: string) {
    setOptions((prev) => {
      const includes = prev.destinations.includes(dest)
        ? prev.destinations.filter((d) => d !== dest)
        : [...prev.destinations, dest]
      return { ...prev, destinations: includes.length > 0 ? includes : prev.destinations }
    })
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-50">Run Backup</h1>
        <p className="text-surface-400 mt-1">Execute a manual backup now</p>
      </div>

      {/* Options */}
      {!isRunning && !isComplete && (
        <div className="space-y-4">
          {/* What to backup */}
          <div className="card">
            <h3 className="font-medium text-surface-200 mb-4">What to backup</h3>
            <div className="grid grid-cols-2 gap-3">
              <ToggleOption
                icon={<Database size={20} />}
                label="Database"
                description="Full PostgreSQL dump via pg_dump"
                active={options.include.includes('database')}
                onClick={() => toggleInclude('database')}
              />
              <ToggleOption
                icon={<FolderOpen size={20} />}
                label="Storage"
                description="All files from Supabase Storage buckets"
                active={options.include.includes('storage')}
                onClick={() => toggleInclude('storage')}
              />
            </div>
          </div>

          {/* Destinations */}
          <div className="card">
            <h3 className="font-medium text-surface-200 mb-4">Destinations</h3>
            <div className="grid grid-cols-2 gap-3">
              <ToggleOption
                icon={<FolderOpen size={20} />}
                label="Local"
                description={config?.destinations?.local?.path || 'Local folder'}
                active={options.destinations.includes('local')}
                onClick={() => toggleDestination('local')}
                disabled={!config?.destinations?.local?.enabled}
              />
              <ToggleOption
                icon={<Cloud size={20} />}
                label="AWS S3"
                description={config?.destinations?.s3?.bucket || 'S3 bucket'}
                active={options.destinations.includes('s3')}
                onClick={() => toggleDestination('s3')}
                disabled={!config?.destinations?.s3?.enabled}
              />
              <ToggleOption
                icon={<Cloud size={20} />}
                label="Google Cloud"
                description={config?.destinations?.gcs?.bucket || 'GCS bucket'}
                active={options.destinations.includes('gcs')}
                onClick={() => toggleDestination('gcs')}
                disabled={!config?.destinations?.gcs?.enabled}
              />
              <ToggleOption
                icon={<Cloud size={20} />}
                label="Azure Blob"
                description={config?.destinations?.azure?.container || 'Azure container'}
                active={options.destinations.includes('azure')}
                onClick={() => toggleDestination('azure')}
                disabled={!config?.destinations?.azure?.enabled}
              />
            </div>
          </div>

          {/* Options */}
          <div className="card">
            <h3 className="font-medium text-surface-200 mb-4">Options</h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.compress}
                  onChange={(e) => setOptions((prev) => ({ ...prev, compress: e.target.checked }))}
                  className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500 focus:ring-brand-500"
                />
                <span className="text-sm text-surface-300">Compress (tar.gz)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.encrypt}
                  onChange={(e) => setOptions((prev) => ({ ...prev, encrypt: e.target.checked }))}
                  className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500 focus:ring-brand-500"
                />
                <span className="text-sm text-surface-300">Encrypt (AES-256)</span>
              </label>
            </div>
          </div>

          {/* Start Button */}
          <button onClick={handleStart} className="btn-primary flex items-center gap-2 w-full justify-center py-3 text-base">
            <PlayCircle size={20} />
            Start Backup
          </button>
        </div>
      )}

      {/* Running */}
      {isRunning && progress && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Loader2 size={20} className="text-brand-400 animate-spin" />
                <h3 className="font-medium text-surface-200">Backup in progress...</h3>
              </div>
              <button onClick={handleCancel} className="btn-danger flex items-center gap-2 text-sm">
                <StopCircle size={16} />
                Cancel
              </button>
            </div>

            {/* Stage indicators */}
            <div className="space-y-3 mb-6">
              {stages.map((stage) => {
                const isCurrent = progress.stage === stage.key
                const isPast = stages.findIndex((s) => s.key === progress.stage) > stages.findIndex((s) => s.key === stage.key)

                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        isPast
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-brand-500 text-white animate-pulse'
                          : 'bg-surface-700 text-surface-400'
                      }`}
                    >
                      {isPast ? <CheckCircle2 size={14} /> : isCurrent ? <Loader2 size={14} className="animate-spin" /> : null}
                    </div>
                    <span
                      className={`text-sm ${
                        isCurrent ? 'text-surface-100 font-medium' : isPast ? 'text-surface-400' : 'text-surface-600'
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>
                )
              })}
            </div>

            <ProgressBar progress={progress.progress} label={progress.message} />
          </div>

          {/* Live Logs */}
          <div className="card">
            <h3 className="font-medium text-surface-200 mb-3">Live Output</h3>
            <div className="bg-surface-950 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs">
              {logs.map((log, i) => (
                <div key={i} className="text-surface-400 py-0.5">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Complete */}
      {isComplete && (
        <div className="card text-center py-12">
          <CheckCircle2 size={64} className="mx-auto text-emerald-400 mb-4" />
          <h3 className="text-xl font-bold text-surface-100 mb-2">Backup Complete!</h3>
          <p className="text-surface-400 mb-6">Your backup has been saved successfully.</p>
          <button
            onClick={() => {
              setIsComplete(false)
              setProgress(null)
              setLogs([])
            }}
            className="btn-secondary"
          >
            Run Another Backup
          </button>
        </div>
      )}

      {/* Error */}
      {error && !isRunning && (
        <div className="card border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <XCircle size={24} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-300 mb-1">Backup Failed</h3>
              <p className="text-sm text-red-400/80">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  setProgress(null)
                  setLogs([])
                }}
                className="btn-secondary mt-4 text-sm"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ToggleOption({
  icon,
  label,
  description,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  description: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-4 rounded-lg border text-left transition-all duration-150 ${
        disabled
          ? 'opacity-40 cursor-not-allowed border-surface-700 bg-surface-800/30'
          : active
          ? 'border-brand-500/50 bg-brand-500/5 hover:bg-brand-500/10'
          : 'border-surface-700 bg-surface-800/30 hover:bg-surface-800'
      }`}
    >
      <div className={`mb-2 ${active ? 'text-brand-400' : 'text-surface-500'}`}>{icon}</div>
      <p className={`text-sm font-medium ${active ? 'text-surface-100' : 'text-surface-300'}`}>
        {label}
      </p>
      <p className="text-xs text-surface-500 mt-0.5 truncate">{description}</p>
    </button>
  )
}
