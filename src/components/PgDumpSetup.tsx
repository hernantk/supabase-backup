import { useState, useEffect } from 'react'
import {
  CheckCircle2,
  XCircle,
  Download,
  FolderOpen,
  RefreshCw,
  Copy,
  Terminal,
  Loader2,
  StopCircle,
  Info,
  AlertTriangle,
  Package,
} from 'lucide-react'
import { ProgressBar } from './ProgressBar'

interface PgDumpInfo {
  found: boolean
  path: string | null
  version: string | null
  source: 'path' | 'resources' | 'custom' | null
}

interface DownloadProgress {
  phase: 'downloading' | 'extracting' | 'done' | 'error'
  progress: number
  message: string
  bytesReceived?: number
  bytesTotal?: number
}

interface WingetProgress {
  phase: 'running' | 'done' | 'error'
  message: string
}

const SOURCE_LABELS: Record<string, string> = {
  path:      'System PATH',
  resources: 'App resources (bundled)',
  custom:    'Custom path',
}

export function PgDumpSetup() {
  const [info, setInfo] = useState<PgDumpInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [installingWinget, setInstallingWinget] = useState(false)
  const [wingetLog, setWingetLog] = useState<string[]>([])
  const [linuxCommands, setLinuxCommands] = useState<string[]>([])
  const [copiedCmd, setCopiedCmd] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isWindows = navigator.platform.toLowerCase().includes('win')
  const isLinux   = navigator.platform.toLowerCase().includes('linux')

  useEffect(() => {
    handleDetect()

    const unsubDownload = window.electronAPI.onPgDumpDownloadProgress((p) => {
      setDownloadProgress(p)
      if (p.phase === 'done') {
        setDownloading(false)
        handleDetect()
      }
      if (p.phase === 'error') {
        setDownloading(false)
        setError(p.message)
      }
    })

    const unsubWinget = window.electronAPI.onPgDumpWingetProgress((p: WingetProgress) => {
      setWingetLog((prev) => [...prev.slice(-49), p.message])
      if (p.phase === 'done') {
        setInstallingWinget(false)
        handleDetect()
      }
      if (p.phase === 'error') {
        setInstallingWinget(false)
        setError(p.message)
      }
    })

    if (isLinux) {
      window.electronAPI.getLinuxInstallCommands().then(setLinuxCommands)
    }

    return () => { unsubDownload(); unsubWinget() }
  }, [])

  async function handleDetect() {
    setDetecting(true)
    setError(null)
    try {
      const result = await window.electronAPI.detectPgDump()
      setInfo(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDetecting(false)
    }
  }

  async function handleBrowse() {
    const filePath = await window.electronAPI.browseFile()
    if (filePath) {
      await window.electronAPI.setPgDumpPath(filePath)
      handleDetect()
    }
  }

  async function handleDownload() {
    setDownloading(true)
    setError(null)
    setDownloadProgress({ phase: 'downloading', progress: 0, message: 'Preparing download...' })
    try {
      await window.electronAPI.downloadPgDump()
    } catch (err: any) {
      setDownloading(false)
      setError(err.message)
      setDownloadProgress(null)
    }
  }

  async function handleAbort() {
    await window.electronAPI.abortPgDumpDownload()
    setDownloading(false)
    setDownloadProgress(null)
  }

  async function handleWinget() {
    setInstallingWinget(true)
    setWingetLog([])
    setError(null)
    try {
      await window.electronAPI.installPgDumpViaWinget()
    } catch (err: any) {
      setInstallingWinget(false)
      setError(err.message)
    }
  }

  function copyCommand(cmd: string, idx: number) {
    navigator.clipboard.writeText(cmd)
    setCopiedCmd(idx)
    setTimeout(() => setCopiedCmd(null), 2000)
  }

  const isBusy = downloading || installingWinget

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Status banner */}
      {info && (
        <div
          className={`flex items-start gap-3 p-4 rounded-lg border ${
            info.found
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-amber-500/5 border-amber-500/20'
          }`}
        >
          {info.found ? (
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            {info.found ? (
              <>
                <p className="text-sm font-medium text-emerald-300">pg_dump found</p>
                <p className="text-xs text-emerald-400/70 mt-0.5 font-mono truncate">
                  {info.path}
                </p>
                <div className="flex flex-wrap gap-3 mt-1">
                  {info.version && (
                    <span className="text-xs text-surface-400">Version: {info.version}</span>
                  )}
                  {info.source && (
                    <span className="text-xs text-surface-400">
                      Source: {SOURCE_LABELS[info.source]}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-amber-300">pg_dump not found</p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  Database backup requires pg_dump. Choose an installation option below.
                </p>
              </>
            )}
          </div>

          <button
            onClick={handleDetect}
            disabled={detecting}
            className="shrink-0 p-1.5 rounded hover:bg-surface-700 transition-colors"
            title="Re-detect"
          >
            <RefreshCw size={14} className={`text-surface-400 ${detecting ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}

      {/* Detecting spinner (first load) */}
      {detecting && !info && (
        <div className="flex items-center gap-2 text-surface-400 text-sm py-2">
          <Loader2 size={16} className="animate-spin" />
          Detecting pg_dump...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/20 bg-red-500/5">
          <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400 break-all">{error}</p>
        </div>
      )}

      {/* Download ZIP progress */}
      {downloadProgress && downloading && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {downloadProgress.phase === 'downloading' ? (
                <Download size={16} className="text-brand-400 animate-pulse" />
              ) : (
                <Loader2 size={16} className="text-brand-400 animate-spin" />
              )}
              <span className="text-sm font-medium text-surface-200">
                {downloadProgress.phase === 'downloading' ? 'Downloading binaries...' : 'Extracting...'}
              </span>
            </div>
            <button
              onClick={handleAbort}
              className="btn-danger flex items-center gap-1 text-xs py-1 px-2"
            >
              <StopCircle size={12} />
              Abort
            </button>
          </div>

          <ProgressBar progress={downloadProgress.progress} label={downloadProgress.message} />

          {downloadProgress.bytesTotal != null && downloadProgress.bytesTotal > 0 && (
            <p className="text-xs text-surface-500 font-mono">
              {formatBytes(downloadProgress.bytesReceived ?? 0)} /{' '}
              {formatBytes(downloadProgress.bytesTotal)}
            </p>
          )}
        </div>
      )}

      {/* Winget install progress */}
      {installingWinget && (
        <div className="card space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="text-brand-400 animate-spin" />
            <span className="text-sm font-medium text-surface-200">Installing via winget...</span>
          </div>
          {wingetLog.length > 0 && (
            <div className="bg-surface-900 rounded p-2 max-h-32 overflow-y-auto">
              {wingetLog.map((line, i) => (
                <p key={i} className="text-xs font-mono text-surface-400 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!isBusy && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {detecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Detect
          </button>

          <button onClick={handleBrowse} className="btn-secondary flex items-center gap-2 text-sm">
            <FolderOpen size={14} />
            Browse binary
          </button>

          {isWindows && (
            <>
              <button
                onClick={handleWinget}
                className="btn-secondary flex items-center gap-2 text-sm"
                title="Installs PostgreSQL 16 via Windows Package Manager (winget)"
              >
                <Package size={14} />
                Install via winget
              </button>

              <button
                onClick={handleDownload}
                className="btn-primary flex items-center gap-2 text-sm"
                title="Downloads pg_dump.exe + required DLLs directly from EnterpriseDB CDN (~195 MB download, ~15 MB kept)"
              >
                <Download size={14} />
                Download pg_dump (~195 MB)
              </button>
            </>
          )}
        </div>
      )}

      {/* Windows info panel (shown when not found) */}
      {isWindows && !info?.found && !isBusy && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-surface-800/50 border border-surface-700">
          <Info size={14} className="text-surface-400 shrink-0 mt-0.5" />
          <div className="text-xs text-surface-400 leading-relaxed space-y-2">
            <p>
              <strong className="text-surface-300">Install via winget</strong> — runs{' '}
              <span className="font-mono text-surface-300">winget install PostgreSQL.PostgreSQL.16</span>.
              Requires the App Installer (pre-installed on Windows 11). Installs the full PostgreSQL
              suite to <span className="font-mono">C:\Program Files\PostgreSQL\16\</span>.
            </p>
            <p>
              <strong className="text-surface-300">Download pg_dump</strong> — downloads the official
              PostgreSQL 16 binary ZIP (~195 MB) from EnterpriseDB CDN and extracts only
              pg_dump.exe + required DLLs (~15 MB) into the app resources folder. No system-wide install.
            </p>
          </div>
        </div>
      )}

      {/* Linux install commands */}
      {isLinux && !info?.found && linuxCommands.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-surface-400" />
            <p className="text-xs font-medium text-surface-300">
              Install via your package manager:
            </p>
          </div>
          {linuxCommands.map((cmd, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-surface-900 border border-surface-700 rounded-lg px-3 py-2"
            >
              <code className="flex-1 text-xs text-surface-300 font-mono truncate">{cmd}</code>
              <button
                onClick={() => copyCommand(cmd, i)}
                className="shrink-0 p-1 rounded hover:bg-surface-700 transition-colors"
                title="Copy"
              >
                {copiedCmd === i ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : (
                  <Copy size={14} className="text-surface-500" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
