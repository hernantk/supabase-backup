import { useState, useEffect, useRef } from 'react'
import {
  RotateCcw,
  FolderOpen,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  TriangleAlert,
  StopCircle,
  Server,
  ChevronDown,
  FileText,
} from 'lucide-react'
import { ProgressBar } from '../components/ProgressBar'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectionConfig {
  id: string
  name: string
  supabase: { url: string; serviceRoleKey: string; dbUrl: string }
}

interface RestoreProgress {
  stage: 'preparing' | 'restoring' | 'done'
  progress: number
  message: string
}

type Screen = 'setup' | 'confirm' | 'running' | 'complete' | 'error'

// ── Component ─────────────────────────────────────────────────────────────────

export function Restore() {
  const [connections, setConnections] = useState<ConnectionConfig[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [filePath, setFilePath] = useState('')
  const [screen, setScreen] = useState<Screen>('setup')
  const [progress, setProgress] = useState<RestoreProgress | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const logsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConnections()

    const unsub = window.electronAPI.onRestoreProgress((p) => {
      setProgress(p)
      setLogs((prev) => {
        const line = `[${p.stage.toUpperCase()}] ${p.message}`
        return prev[prev.length - 1] === line ? prev : [...prev, line]
      })
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [logs])

  async function loadConnections() {
    const cfg = await window.electronAPI.getConfig()
    setConnections(cfg.connections as any)
    if (cfg.connections.length > 0) {
      setSelectedConnectionId(cfg.connections[0].id)
    }
  }

  const selectedConnection = connections.find((c) => c.id === selectedConnectionId)

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleBrowse() {
    const picked = await window.electronAPI.browseFile()
    if (picked) setFilePath(picked)
  }

  function handleStartRestore() {
    if (!selectedConnectionId || !filePath) return
    setScreen('confirm')
  }

  async function handleConfirmRestore() {
    setScreen('running')
    setLogs([])
    setProgress(null)
    setError(null)

    try {
      await window.electronAPI.restoreDatabase(selectedConnectionId, filePath)
      setScreen('complete')
    } catch (err: any) {
      setError(err.message ?? 'Restore failed')
      setScreen('error')
    }
  }

  async function handleCancel() {
    await window.electronAPI.cancelRestore()
    setError('Restore cancelled by user')
    setScreen('error')
  }

  function reset() {
    setScreen('setup')
    setFilePath('')
    setProgress(null)
    setLogs([])
    setError(null)
  }

  // ── Screens ───────────────────────────────────────────────────────────────────

  // Confirmation / warning modal overlay
  if (screen === 'confirm') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-surface-900 border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          {/* Red header band */}
          <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-5 flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-500/15">
              <ShieldAlert size={22} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-red-300">Destructive Operation</h2>
              <p className="text-xs text-red-400/70">This action cannot be undone</p>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-surface-300 leading-relaxed">
              Restoring this backup will <span className="text-red-400 font-semibold">overwrite all existing data</span> in the database:
            </p>

            {/* Connection info box */}
            <div className="bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-surface-500">Connection</span>
                <span className="text-surface-200 font-medium">{selectedConnection?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-surface-500">Database URL</span>
                <span className="text-surface-400 font-mono text-xs truncate max-w-[200px]">
                  {selectedConnection?.supabase.dbUrl?.replace(/:[^:@]*@/, ':***@') ?? '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-surface-500">Backup file</span>
                <span className="text-surface-400 text-xs truncate max-w-[200px]">
                  {filePath.split(/[\\/]/).pop()}
                </span>
              </div>
            </div>

            {/* Warning list */}
            <ul className="space-y-1.5 text-sm text-surface-400">
              {[
                'All tables and views will be dropped and recreated',
                'All existing rows will be permanently deleted',
                'This operation is irreversible',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <TriangleAlert size={13} className="text-amber-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-surface-800/50 border-t border-surface-700 flex gap-3 justify-end">
            <button
              onClick={() => setScreen('setup')}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmRestore}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
            >
              <ShieldAlert size={14} />
              Yes, overwrite and restore
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Running screen
  if (screen === 'running') {
    const stageLabel = progress?.stage === 'preparing'
      ? 'Preparing'
      : progress?.stage === 'restoring'
      ? 'Restoring database'
      : 'Finalizing'

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Loader2 size={18} className="text-amber-400 animate-spin" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-surface-100">Restore in progress</h1>
              <p className="text-xs text-surface-400">{selectedConnection?.name}</p>
            </div>
          </div>
          <button onClick={handleCancel} className="btn-danger flex items-center gap-2 text-sm">
            <StopCircle size={15} />
            Cancel
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-5 space-y-3 shrink-0 border-b border-surface-700">
          <div className="flex items-center justify-between text-xs text-surface-400 mb-1">
            <span className="font-medium text-surface-200">{stageLabel}</span>
            <span className="font-mono">{progress?.progress ?? 0}%</span>
          </div>
          <ProgressBar
            progress={progress?.progress ?? 0}
            label={progress?.message ?? 'Starting...'}
            showPercentage={false}
          />
        </div>

        {/* Live log */}
        <div className="flex-1 px-6 pb-6 pt-4 min-h-0 flex flex-col">
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

  // Complete screen
  if (screen === 'complete') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 max-w-md mx-auto text-center px-6">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-surface-50 mb-2">Restore Complete</h2>
          <p className="text-surface-400 text-sm">
            The database was restored successfully to <span className="text-surface-200">{selectedConnection?.name}</span>.
          </p>
        </div>
        <button onClick={reset} className="btn-secondary flex items-center gap-2">
          <RotateCcw size={15} />
          Restore Another
        </button>
      </div>
    )
  }

  // Error screen
  if (screen === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 max-w-md mx-auto text-center px-6">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
          <XCircle size={40} className="text-red-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-surface-50 mb-2">Restore Failed</h2>
          <p className="text-sm text-red-400/80 break-words">{error}</p>
        </div>
        <button onClick={reset} className="btn-secondary flex items-center gap-2">
          <RotateCcw size={15} />
          Try Again
        </button>
      </div>
    )
  }

  // ── Setup screen ──────────────────────────────────────────────────────────────
  const canStart = !!selectedConnectionId && !!filePath

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-surface-50">Restore Database</h1>
        <p className="text-surface-400 mt-1">Restore a PostgreSQL backup to an existing connection</p>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-500/8 border border-amber-500/20">
        <TriangleAlert size={16} className="text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-300/90">
          Restore will <strong>drop and recreate all database objects</strong>. All existing data will be permanently replaced by the backup.
        </p>
      </div>

      {/* Connection selector */}
      <div className="card space-y-3">
        <h3 className="font-medium text-surface-200 flex items-center gap-2">
          <Server size={16} className="text-surface-400" />
          Target Connection
        </h3>

        {connections.length === 0 ? (
          <p className="text-sm text-amber-400">
            No connections configured. Go to Settings → Connections first.
          </p>
        ) : connections.length === 1 ? (
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
              onChange={(e) => setSelectedConnectionId(e.target.value)}
              className="input w-full appearance-none pr-8 cursor-pointer"
            >
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>{conn.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
          </div>
        )}
      </div>

      {/* File selector */}
      <div className="card space-y-3">
        <h3 className="font-medium text-surface-200 flex items-center gap-2">
          <FileText size={16} className="text-surface-400" />
          Backup File
        </h3>
        <p className="text-xs text-surface-500">
          Accepts plain SQL dumps (<code>.sql</code>) or compressed archives (<code>.tar.gz</code>) produced by this app.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={filePath}
            readOnly
            placeholder="No file selected..."
            className="input flex-1 text-sm text-surface-300 cursor-default"
          />
          <button onClick={handleBrowse} className="btn-secondary flex items-center gap-2 shrink-0">
            <FolderOpen size={15} />
            Browse
          </button>
        </div>
        {filePath && (
          <p className="text-xs text-surface-500 font-mono truncate">{filePath}</p>
        )}
      </div>

      {/* Start button */}
      <button
        onClick={handleStartRestore}
        disabled={!canStart}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-base font-medium transition-colors"
      >
        <ShieldAlert size={18} />
        Restore Database
        {selectedConnection && (
          <span className="text-red-300 text-sm font-normal">— {selectedConnection.name}</span>
        )}
      </button>
    </div>
  )
}
