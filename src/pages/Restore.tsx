import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CheckCircle2, FileText, FolderOpen, Loader2, RotateCcw, ShieldAlert, StopCircle, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfig, useHistory } from '../hooks/useConfig'
import { ProgressBar } from '../components/ProgressBar'
import { CenteredSpinner, ConfirmSheet, EmptyState, Notice, PageHeader, Section, Switch } from '../components/ui'
import { formatBytes, formatRelative } from '../lib/format'
import { cleanError } from '../lib/api'
import type { RestoreProgress, RestoreResult } from '../../electron/preload'

type Screen = 'setup' | 'running' | 'done' | 'error'

export function Restore() {
  const { t } = useTranslation()
  const location = useLocation()
  const preset = (location.state ?? {}) as { filePath?: string; connectionId?: string }
  const { data: config } = useConfig()
  const { data: history } = useHistory()

  const [filePath, setFilePath] = useState(preset.filePath ?? '')
  const [sourceConnectionId, setSourceConnectionId] = useState<string | undefined>(preset.connectionId)
  const [targetId, setTargetId] = useState(preset.connectionId ?? '')
  const [password, setPassword] = useState('')
  const [scope, setScope] = useState<{ database: boolean; storage: boolean }>({ database: true, storage: true })
  const [confirming, setConfirming] = useState(false)
  const [screen, setScreen] = useState<Screen>('setup')
  const [progress, setProgress] = useState<RestoreProgress | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<RestoreResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logsRef = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      window.electronAPI.onRestoreProgress((p) => {
        setProgress(p)
        setLogs((prev) => {
          const line = `[${p.stage.toUpperCase()}] ${p.message}`
          return prev[prev.length - 1] === line ? prev : [...prev.slice(-300), line]
        })
      }),
    []
  )

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [logs])

  const connections = config?.connections ?? []
  const target = connections.find((c) => c.id === targetId) ?? connections[0]
  const effectiveTargetId = target?.id ?? ''

  const isSql = filePath.endsWith('.sql')
  const isEncrypted = filePath.endsWith('.enc')
  const dbAccess = !!target?.supabase.dbUrl?.trim()
  const storageAccess = !!target?.supabase.url && !!target?.supabase.serviceRoleKey

  const recent = useMemo(() => (history ?? []).filter((r) => r.status === 'success' && r.localPath).slice(0, 6), [history])

  if (!config) return <CenteredSpinner />

  const wantsDatabase = scope.database && dbAccess
  const wantsStorage = scope.storage && storageAccess && !isSql
  const canStart = !!filePath && !!target && (wantsDatabase || wantsStorage) && (!isEncrypted || password.length > 0)

  async function browse() {
    const picked = await window.electronAPI.browseBackupFile()
    if (picked) {
      setFilePath(picked)
      setSourceConnectionId(undefined)
    }
  }

  async function start() {
    if (!target) return
    setScreen('running')
    setLogs([])
    setProgress(null)
    setError(null)
    try {
      const res = await window.electronAPI.restoreBackup({
        connectionId: target.id,
        filePath,
        scope: [...(wantsDatabase ? (['database'] as const) : []), ...(wantsStorage ? (['storage'] as const) : [])],
        password: isEncrypted ? password : undefined,
        confirmName: target.name,
      })
      setResult(res)
      setScreen('done')
    } catch (err) {
      const message = cleanError(err)
      setError(message.includes('cancelled') ? t('restore.cancelled') : message)
      setScreen('error')
    }
  }

  function reset() {
    setScreen('setup')
    setProgress(null)
    setLogs([])
    setResult(null)
    setError(null)
  }

  // ── Running ──────────────────────────────────────────────────────────────────
  if (screen === 'running') {
    return (
      <div className="space-y-6 max-w-3xl">
        <PageHeader
          title={t('restore.running')}
          subtitle={target?.name}
          actions={
            <button className="btn-danger" onClick={() => window.electronAPI.cancelRestore()}>
              <StopCircle size={14} />
              {t('common.cancel')}
            </button>
          }
        />
        <div className="list-group px-5 py-4 space-y-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="inline-flex items-center gap-2 font-medium text-surface-100">
              <Loader2 size={14} className="animate-spin text-brand-400" />
              {t(`restore.stages.${progress?.stage ?? 'preparing'}`)}
            </span>
            <span className="font-mono text-surface-400">{progress?.progress ?? 0}%</span>
          </div>
          <ProgressBar progress={progress?.progress ?? 0} label={progress?.message} showPercentage={false} />
        </div>
        <Section title={t('restore.liveOutput')}>
          <div ref={logsRef} className="max-h-72 overflow-y-auto rounded-xl bg-surface-900 border border-surface-700/70 p-4 font-mono text-[12px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-surface-500">{t('restore.waiting')}</p>
            ) : (
              logs.map((line, i) => (
                <div key={i} className="text-surface-300 py-0.5 break-all">{line}</div>
              ))
            )}
          </div>
        </Section>
      </div>
    )
  }

  // ── Done / error ─────────────────────────────────────────────────────────────
  if (screen === 'done' || screen === 'error') {
    return (
      <div className="space-y-6 max-w-3xl">
        <PageHeader title={screen === 'done' ? t('restore.complete') : t('restore.failed')} subtitle={screen === 'done' ? t('restore.completeBody', { name: target?.name }) : undefined} />
        {screen === 'done' && result ? (
          <div className="space-y-4">
            <div className="list-group">
              {result.database && (
                <div className="list-row">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span className="text-[14px] text-surface-100">{t('restore.resultDatabase')}</span>
                </div>
              )}
              {result.storageBuckets > 0 && (
                <div className="list-row">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span className="text-[14px] text-surface-100">
                    {t('restore.resultStorage', { count: result.storageFiles, buckets: result.storageBuckets })}
                  </span>
                </div>
              )}
            </div>
            {result.warnings.length > 0 && (
              <Notice tone="warning">
                <p className="font-medium">{t('restore.warnings')}</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                  {result.warnings.slice(0, 50).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}
          </div>
        ) : (
          error && <Notice tone="error">{error}</Notice>
        )}
        <button className="btn-secondary" onClick={reset}>
          <RotateCcw size={14} />
          {screen === 'done' ? t('restore.another') : t('common.retry')}
        </button>
      </div>
    )
  }

  // ── Setup ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-7 max-w-3xl">
      <PageHeader title={t('restore.title')} subtitle={t('restore.subtitle')} />
      <Notice tone="warning">{t('restore.warning')}</Notice>

      <Section title={t('restore.source')} footer={t('restore.sourceHint')}>
        <div className="list-group">
          <div className="list-row">
            <FileText size={16} className="text-surface-400 shrink-0" />
            <span className={`flex-1 min-w-0 truncate text-[13.5px] ${filePath ? 'text-surface-100 font-mono' : 'text-surface-500'}`} title={filePath}>
              {filePath || t('restore.noFile')}
            </span>
            <button className="btn-secondary" onClick={browse}>
              <FolderOpen size={14} />
              {t('restore.browse')}
            </button>
          </div>
          {isEncrypted && (
            <div className="list-row">
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] text-surface-100">{t('restore.password')}</span>
                <span className="block text-[12.5px] text-surface-500">{t('restore.passwordHint')}</span>
              </span>
              <input className="input !w-56" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="text-[12.5px] font-medium text-surface-500 px-1 mb-1.5">{t('restore.recent')}</p>
          {recent.length === 0 ? (
            <p className="px-1 text-[13px] text-surface-500">{t('restore.recentEmpty')}</p>
          ) : (
            <ul className="list-group">
              {recent.map((r) => (
                <li key={r.id}>
                  <button
                    className={`list-row w-full text-left !min-h-[48px] ${filePath === r.localPath ? 'bg-brand-500/10' : 'hover:bg-surface-800/50'}`}
                    onClick={() => {
                      setFilePath(r.localPath!)
                      setSourceConnectionId(r.connectionId)
                      if (r.connectionId && connections.some((c) => c.id === r.connectionId)) setTargetId(r.connectionId)
                    }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] text-surface-100 truncate">{r.connectionName ?? '—'}</span>
                      <span className="block text-[12.5px] text-surface-500 truncate">{formatRelative(r.timestamp)} · {formatBytes(r.size)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section title={t('restore.target')} footer={t('restore.targetHint')}>
        {connections.length === 0 ? (
          <EmptyState icon={ShieldAlert} title={t('restore.noProjects')} />
        ) : (
          <div className="list-group">
            <div className="list-row">
              <select className="input" value={effectiveTargetId} onChange={(e) => setTargetId(e.target.value)}>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.projectRef ? ` · ${c.projectRef}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {sourceConnectionId && target && (
              <div className="px-4 py-2.5 text-[12.5px] text-surface-400">
                {sourceConnectionId === target.id ? t('restore.sameProject') : t('restore.otherProject')}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title={t('restore.scope')}>
        <div className="list-group">
          <label className={`list-row ${dbAccess ? 'cursor-pointer' : 'opacity-60'}`}>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] text-surface-100">{t('restore.scopeDatabase')}</span>
              <span className="block text-[12.5px] text-surface-500">{dbAccess ? t('restore.scopeDatabaseHint') : t('restore.noDatabaseAccess')}</span>
            </span>
            <Switch label={t('restore.scopeDatabase')} checked={scope.database && dbAccess} disabled={!dbAccess} onChange={(database) => setScope({ ...scope, database })} />
          </label>
          <label className={`list-row ${storageAccess && !isSql ? 'cursor-pointer' : 'opacity-60'}`}>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] text-surface-100">{t('restore.scopeStorage')}</span>
              <span className="block text-[12.5px] text-surface-500">
                {isSql ? t('restore.sqlOnly') : storageAccess ? t('restore.scopeStorageHint') : t('restore.noStorageAccess')}
              </span>
            </span>
            <Switch
              label={t('restore.scopeStorage')}
              checked={scope.storage && storageAccess && !isSql}
              disabled={!storageAccess || isSql}
              onChange={(storage) => setScope({ ...scope, storage })}
            />
          </label>
        </div>
      </Section>

      <div className="flex justify-end">
        <button className="btn-danger" disabled={!canStart} onClick={() => setConfirming(true)}>
          <ShieldAlert size={15} />
          {target ? t('restore.startInto', { name: target.name }) : t('restore.start')}
        </button>
      </div>

      {target && (
        <ConfirmSheet
          open={confirming}
          onOpenChange={setConfirming}
          title={t('restore.confirm.title', { name: target.name })}
          description={
            <div className="space-y-2">
              <p>{t('restore.confirm.body')}</p>
              <ul className="space-y-1">
                {wantsDatabase && (
                  <li className="flex items-start gap-2"><TriangleAlert size={14} className="text-amber-400 mt-0.5 shrink-0" />{t('restore.confirm.db')}</li>
                )}
                {wantsStorage && (
                  <li className="flex items-start gap-2"><TriangleAlert size={14} className="text-amber-400 mt-0.5 shrink-0" />{t('restore.confirm.storage')}</li>
                )}
              </ul>
            </div>
          }
          actionLabel={t('restore.confirm.action')}
          confirmText={target.name}
          onConfirm={() => {
            void start()
          }}
        />
      )}
    </div>
  )
}
