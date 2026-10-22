import { useState, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, Download, FolderOpen, RefreshCw, Copy, Terminal, Loader2, StopCircle, Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ProgressBar } from './ProgressBar'
import { Notice, Section } from './ui'
import { formatBytes } from '../lib/format'
import type { PgDumpDownloadProgress, PgDumpInfo, PgDumpWingetProgress } from '../../electron/preload'

export function PgDumpSetup() {
  const { t } = useTranslation()
  const [info, setInfo] = useState<PgDumpInfo | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<PgDumpDownloadProgress | null>(null)
  const [installingWinget, setInstallingWinget] = useState(false)
  const [wingetLog, setWingetLog] = useState<string[]>([])
  const [linuxCommands, setLinuxCommands] = useState<string[]>([])
  const [copiedCmd, setCopiedCmd] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isWindows = navigator.userAgent.includes('Windows')
  const isLinux = navigator.userAgent.includes('Linux') && !navigator.userAgent.includes('Android')

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

    const unsubWinget = window.electronAPI.onPgDumpWingetProgress((p: PgDumpWingetProgress) => {
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

    if (isLinux) window.electronAPI.getLinuxInstallCommands().then(setLinuxCommands)

    return () => {
      unsubDownload()
      unsubWinget()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDetect() {
    setDetecting(true)
    setError(null)
    try {
      setInfo(await window.electronAPI.detectPgDump())
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
    setDownloadProgress({ phase: 'downloading', progress: 0, message: t('pgdump.preparing') })
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

  return (
    <div className="space-y-5">
      <p className="px-1 text-[13.5px] text-surface-400">{t('pgdump.intro')}</p>

      {info && (
        <div className="list-group">
          <div className="list-row items-start !py-3.5">
            {info.found ? (
              <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-surface-100">{info.found ? t('pgdump.found') : t('pgdump.notFound')}</p>
              {info.found ? (
                <>
                  <p className="text-[12.5px] text-surface-400 font-mono truncate mt-0.5">{info.path}</p>
                  <p className="text-[12.5px] text-surface-500 mt-1">
                    {info.version && t('pgdump.version', { version: info.version })}
                    {info.version && info.source && ' · '}
                    {info.source && t('pgdump.source', { source: t(`pgdump.sources.${info.source}`) })}
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-surface-400 mt-0.5">{t('pgdump.notFoundBody')}</p>
              )}
            </div>
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="p-1.5 rounded hover:bg-surface-800 text-surface-400"
              title={t('pgdump.redetect')}
            >
              <RefreshCw size={14} className={detecting ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      )}

      {detecting && !info && (
        <div className="flex items-center gap-2 text-surface-400 text-[13.5px] py-2">
          <Loader2 size={16} className="animate-spin" />
          {t('pgdump.detecting')}
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {downloadProgress && downloading && (
        <div className="list-group px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[14px] font-medium text-surface-100">
              {downloadProgress.phase === 'downloading' ? <Download size={16} className="text-brand-400 animate-pulse" /> : <Loader2 size={16} className="text-brand-400 animate-spin" />}
              {downloadProgress.phase === 'downloading' ? t('pgdump.downloading') : t('pgdump.extracting')}
            </span>
            <button onClick={handleAbort} className="btn-danger !py-1 !px-2.5 text-[12.5px]">
              <StopCircle size={12} />
              {t('pgdump.abort')}
            </button>
          </div>
          <ProgressBar progress={downloadProgress.progress} label={downloadProgress.message} />
          {downloadProgress.bytesTotal != null && downloadProgress.bytesTotal > 0 && (
            <p className="text-[12px] text-surface-500 font-mono">
              {formatBytes(downloadProgress.bytesReceived ?? 0)} / {formatBytes(downloadProgress.bytesTotal)}
            </p>
          )}
        </div>
      )}

      {installingWinget && (
        <div className="list-group px-4 py-4 space-y-2">
          <span className="inline-flex items-center gap-2 text-[14px] font-medium text-surface-100">
            <Loader2 size={16} className="text-brand-400 animate-spin" />
            {t('pgdump.wingetRunning')}
          </span>
          {wingetLog.length > 0 && (
            <div className="rounded-lg bg-surface-950 p-2 max-h-32 overflow-y-auto">
              {wingetLog.map((line, i) => (
                <p key={i} className="text-[12px] font-mono text-surface-400 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {!isBusy && (
        <div className="flex flex-wrap gap-2">
          <button onClick={handleDetect} disabled={detecting} className="btn-secondary">
            {detecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t('pgdump.detect')}
          </button>
          <button onClick={handleBrowse} className="btn-secondary">
            <FolderOpen size={14} />
            {t('pgdump.browse')}
          </button>
          {isWindows && (
            <>
              <button onClick={handleWinget} className="btn-secondary" title={t('pgdump.wingetHint')}>
                <Package size={14} />
                {t('pgdump.winget')}
              </button>
              <button onClick={handleDownload} className="btn-primary" title={t('pgdump.downloadHint')}>
                <Download size={14} />
                {t('pgdump.download')}
              </button>
            </>
          )}
        </div>
      )}

      {isWindows && !info?.found && !isBusy && (
        <Section>
          <div className="space-y-2 text-[12.5px] text-surface-400 leading-relaxed px-1">
            <p><strong className="text-surface-200">{t('pgdump.winget')}</strong> — {t('pgdump.windowsInfo.winget')}</p>
            <p><strong className="text-surface-200">{t('pgdump.download')}</strong> — {t('pgdump.windowsInfo.download')}</p>
          </div>
        </Section>
      )}

      {isLinux && !info?.found && linuxCommands.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[13px] font-medium text-surface-300 px-1">
            <Terminal size={14} className="text-surface-400" />
            {t('pgdump.linuxCommands')}
          </p>
          {linuxCommands.map((cmd, i) => (
            <div key={i} className="list-group list-row !min-h-0 !py-2">
              <code className="flex-1 text-[12.5px] text-surface-200 font-mono truncate">{cmd}</code>
              <button onClick={() => copyCommand(cmd, i)} className="shrink-0 p-1 rounded hover:bg-surface-800" title={t('common.copy')}>
                {copiedCmd === i ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} className="text-surface-500" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
