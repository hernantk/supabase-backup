import { useState, useEffect, useRef } from 'react'
import {
  PlayCircle,
  StopCircle,
  Database,
  FolderOpen,
  Cloud,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  RotateCcw,
  Server,
  FolderOpenDot,
} from 'lucide-react'
import { ProgressBar } from '../components/ProgressBar'
import { useBackup } from '../contexts/BackupContext'

type BackupStage = 'database' | 'storage' | 'compress' | 'encrypt' | 'upload'

interface BackupProgress {
  stage: BackupStage
  progress: number
  message: string
}

interface ConnectionConfig {
  id: string
  name: string
  supabase: { url: string; serviceRoleKey: string; dbUrl: string }
  backup: {
    include: ('database' | 'storage')[]
    compress: boolean
    encrypt: boolean
    encryptionPassword: string
    retention: { enabled: boolean; keepLast: number }
  }
  schedule: { enabled: boolean; cron: string }
}

interface AppConfig {
  connections: ConnectionConfig[]
  destinations: {
    local: { enabled: boolean; path: string }
    s3: { enabled: boolean; bucket: string }
    gcs: { enabled: boolean; bucket: string }
    azure: { enabled: boolean; container: string }
  }
}

const STAGES: { key: BackupStage; label: string; icon: string }[] = [
  { key: 'database', label: 'Database Dump',     icon: '🗃' },
  { key: 'storage',  label: 'Storage Download',  icon: '📁' },
  { key: 'compress', label: 'Compression',        icon: '📦' },
  { key: 'encrypt',  label: 'Encryption',         icon: '🔒' },
  { key: 'upload',   label: 'Upload',             icon: '☁' },
]

export function RunBackup() {
  const backup = useBackup()

  const [config, setConfig] = useState<AppConfig | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')
  const [isComplete, setIsComplete] = useState(false)
  const [completedResult, setCompletedResult] = useState<any>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [options, setOptions] = useState({
    include: ['database', 'storage'] as ('database' | 'storage')[],
    destinations: [] as string[],
    compress: true,
    encrypt: false,
  })
  const [logs, setLogs] = useState<string[]>([])
  const logsRef = useRef<HTMLDivElement>(null)

  // Load config once
  useEffect(() => { loadConfig() }, [])

  // Accumulate log entries from global backup progress
  useEffect(() => {
    if (backup.progress) {
      const line = `[${backup.progress.stage.toUpperCase()}] ${backup.progress.message}`
      setLogs((prev) => (prev[prev.length - 1] === line ? prev : [...prev, line]))
    }
  }, [backup.progress])

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [logs])

  async function loadConfig() {
    const cfg = await window.electronAPI.getConfig()
    setConfig(cfg as any)

    const firstId = cfg.connections[0]?.id ?? ''
    setSelectedConnectionId(firstId)

    const conn = cfg.connections[0]
    if (conn) {
      setOptions({
        include: conn.backup.include,
        destinations: getEnabledDestinations(cfg as any),
        compress: conn.backup.compress,
        encrypt: conn.backup.encrypt,
      })
    }
  }

  function handleSelectConnection(id: string) {
    setSelectedConnectionId(id)
    const conn = config?.connections.find((c) => c.id === id)
    if (conn) {
      setOptions((prev) => ({
        ...prev,
        include: conn.backup.include,
        compress: conn.backup.compress,
        encrypt: conn.backup.encrypt,
      }))
    }
  }

  function getEnabledDestinations(cfg: AppConfig): string[] {
    const d: string[] = []
    if (cfg.destinations.local.enabled) d.push('local')
    if (cfg.destinations.s3.enabled) d.push('s3')
    if (cfg.destinations.gcs.enabled) d.push('gcs')
    if (cfg.destinations.azure.enabled) d.push('azure')
    return d.length > 0 ? d : ['local']
  }

  async function handleStart() {
    if (!selectedConnectionId) return
    setIsComplete(false)
    setCompletedResult(null)
    setLocalError(null)
    setLogs([])

    try {
      const result = await backup.startBackup(selectedConnectionId, options)
      if (result.success) {
        setCompletedResult(result)
        setIsComplete(true)
      } else {
        setLocalError(result.error ?? 'Backup failed')
      }
    } catch (err: any) {
      setLocalError(err.message ?? 'Backup failed')
    }
  }

  async function handleCancel() {
    await backup.cancelBackup()
    setLocalError('Backup cancelled')
  }

  function toggleInclude(type: 'database' | 'storage') {
    setOptions((prev) => {
      const next = prev.include.includes(type)
        ? prev.include.filter((t) => t !== type)
        : [...prev.include, type]
      return { ...prev, include: next.length > 0 ? next : prev.include }
    })
  }

  function toggleDestination(dest: string) {
    setOptions((prev) => {
      const next = prev.destinations.includes(dest)
        ? prev.destinations.filter((d) => d !== dest)
        : [...prev.destinations, dest]
      return { ...prev, destinations: next.length > 0 ? next : prev.destinations }
    })
  }

  function resetState() {
    setIsComplete(false)
    setLocalError(null)
    setLogs([])
    setCompletedResult(null)
    backup.clearState()
  }

  const selectedConnection = config?.connections.find((c) => c.id === selectedConnectionId)
  const currentStageIndex = STAGES.findIndex((s) => s.key === backup.progress?.stage)

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (backup.isRunning) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center">
              <Loader2 size={18} className="text-brand-400 animate-spin" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-surface-100">Backup in progress</h1>
              <p className="text-xs text-surface-400">
                {selectedConnection?.name ?? 'Connection'}
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="btn-danger flex items-center gap-2 text-sm"
          >
            <StopCircle size={15} />
            Cancel
          </button>
        </div>

        {/* Stage pipeline */}
        <div className="px-6 py-5 border-b border-surface-700 shrink-0">
          <div className="flex items-center gap-1">
            {STAGES.map((stage, i) => {
              const isPast    = i < currentStageIndex
              const isCurrent = i === currentStageIndex
              const isFuture  = i > currentStageIndex
              return (
                <div key={stage.key} className="flex items-center gap-1 flex-1 min-w-0">
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium flex-1 min-w-0 transition-all ${
                      isPast
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : isCurrent
                        ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/40'
                        : 'bg-surface-800/50 text-surface-600'
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
                    ) : isCurrent ? (
                      <Loader2 size={13} className="shrink-0 animate-spin" />
                    ) : (
                      <div className="w-3 h-3 shrink-0 rounded-full border border-surface-600" />
                    )}
                    <span className="truncate hidden sm:block">{stage.label}</span>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div
                      className={`w-4 h-px shrink-0 ${isPast ? 'bg-emerald-500/40' : 'bg-surface-700'}`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Progress */}
        <div className="px-6 py-4 space-y-3 shrink-0">
          <div className="flex items-center justify-between text-xs text-surface-400 mb-1">
            <span className="font-medium text-surface-200">
              {STAGES[currentStageIndex]?.label ?? 'Preparing...'}
            </span>
            <span className="font-mono">{backup.progress?.progress ?? 0}%</span>
          </div>
          <ProgressBar
            progress={backup.progress?.progress ?? 0}
            label={backup.progress?.message ?? 'Starting...'}
            showPercentage={false}
          />
        </div>

        {/* Live log */}
        <div className="flex-1 px-6 pb-6 min-h-0 flex flex-col">
          <p className="text-xs font-medium text-surface-400 mb-2 shrink-0">Live output</p>
          <div
            ref={logsRef}
            className="flex-1 min-h-0 bg-surface-950 rounded-lg p-4 overflow-y-auto font-mono text-xs leading-relaxed"
          >
            {logs.length === 0 ? (
              <p className="text-surface-600">Waiting for output...</p>
            ) : (
              logs.map((line, i) => (
                <div key={i} className="text-surface-400 py-0.5">
                  <span className="text-surface-600 select-none mr-2">{String(i + 1).padStart(3, '0')}</span>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Complete screen ─────────────────────────────────────────────────────────
  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 max-w-md mx-auto text-center px-6">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-surface-50 mb-2">Backup Complete</h2>
          <p className="text-surface-400 text-sm">
            {selectedConnection?.name ?? 'Connection'} was backed up successfully.
          </p>
        </div>
        {completedResult && (
          <div className="w-full bg-surface-800/50 rounded-lg border border-surface-700 p-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Size</span>
              <span className="text-surface-200 font-mono">{formatBytes(completedResult.size)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Duration</span>
              <span className="text-surface-200">{formatDuration(completedResult.duration)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-400">Destinations</span>
              <span className="text-surface-200">{completedResult.destinations.join(', ')}</span>
            </div>
          </div>
        )}
        <button onClick={resetState} className="btn-secondary flex items-center gap-2">
          <RotateCcw size={15} />
          Run Another Backup
        </button>
        {completedResult?.localPath && (
          <button
            onClick={() => window.electronAPI.openFolder(completedResult.localPath!)}
            className="btn-ghost flex items-center gap-2 text-surface-400 hover:text-surface-200"
          >
            <FolderOpenDot size={15} />
            Open Backup Folder
          </button>
        )}
      </div>
    )
  }

  // ── Error screen ────────────────────────────────────────────────────────────
  if (localError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 max-w-md mx-auto text-center px-6">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
          <XCircle size={40} className="text-red-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-surface-50 mb-2">Backup Failed</h2>
          <p className="text-sm text-red-400/80 break-words">{localError}</p>
        </div>
        <button onClick={resetState} className="btn-secondary flex items-center gap-2">
          <RotateCcw size={15} />
          Try Again
        </button>
      </div>
    )
  }

  // ── Options screen ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-50">Run Backup</h1>
        <p className="text-surface-400 mt-1">Execute a manual backup now</p>
      </div>

      {backup.isRunning && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-brand-500/8 border border-brand-500/20">
          <Loader2 size={16} className="animate-spin text-brand-400 shrink-0" />
          <p className="text-sm text-brand-300">
            A backup is currently running.{' '}
            <span onClick={() => window.scrollTo(0, document.body.scrollHeight)} className="underline cursor-pointer hover:text-brand-200">
              View progress
            </span>
          </p>
        </div>
      )}

      {/* Connection selector */}
      <div className="card space-y-3">
        <h3 className="font-medium text-surface-200 flex items-center gap-2">
          <Server size={16} className="text-surface-400" />
          Connection
        </h3>

        {!config || config.connections.length === 0 ? (
          <p className="text-sm text-amber-400">
            No connections configured. Go to Settings → Connections to add one.
          </p>
        ) : config.connections.length === 1 ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/50 border border-surface-700">
            <div className="w-2 h-2 rounded-full bg-brand-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-surface-200 truncate">{selectedConnection?.name}</p>
              <p className="text-xs text-surface-500 truncate">{selectedConnection?.supabase.url || 'URL not configured'}</p>
            </div>
          </div>
        ) : (
          <div className="relative">
            <select
              value={selectedConnectionId}
              onChange={(e) => handleSelectConnection(e.target.value)}
              className="input w-full appearance-none pr-8 cursor-pointer"
            >
              {config.connections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
            />
          </div>
        )}
      </div>

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
        <div className="flex gap-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.compress}
              onChange={(e) => setOptions((prev) => ({ ...prev, compress: e.target.checked }))}
              className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
            />
            <span className="text-sm text-surface-300">Compress (tar.gz)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.encrypt}
              onChange={(e) => setOptions((prev) => ({ ...prev, encrypt: e.target.checked }))}
              className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
            />
            <span className="text-sm text-surface-300">Encrypt (AES-256)</span>
          </label>
        </div>
      </div>

      {/* Start */}
      <button
        onClick={handleStart}
        disabled={!selectedConnectionId || !config}
        className="btn-primary flex items-center gap-2 w-full justify-center py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <PlayCircle size={20} />
        Start Backup
        {selectedConnection && (
          <span className="text-brand-300 text-sm font-normal">— {selectedConnection.name}</span>
        )}
      </button>
    </div>
  )
}

function ToggleOption({
  icon, label, description, active, onClick, disabled,
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}
