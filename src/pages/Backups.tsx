import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, FolderKanban, Loader2, PlayCircle, StopCircle, Trash2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useJobs, type BatchView, type JobView } from '../contexts/JobsContext'
import { useConfig } from '../hooks/useConfig'
import { ProgressBar } from '../components/ProgressBar'
import { CenteredSpinner, EmptyState, Notice, PageHeader, Section } from '../components/ui'
import { formatBytes, formatDuration } from '../lib/format'
import type { ConnectionConfig } from '../../electron/preload'

const STATE_STYLES: Record<JobView['state'], string> = {
  queued: 'bg-surface-500/10 text-surface-400 border-surface-500/20',
  running: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  succeeded: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

type Problem = 'notConfigured' | 'databasePassword' | 'databaseUrl' | 'storageKey' | null

/** Why a project cannot be backed up as configured, or null when it is ready. */
function problemWith(c: ConnectionConfig): Problem {
  if (!c.supabase.url && !c.supabase.dbUrl) return 'notConfigured'
  if (c.backup.include.includes('database') && !c.supabase.dbUrl) return c.projectRef ? 'databasePassword' : 'databaseUrl'
  if (c.backup.include.includes('storage') && (!c.supabase.url || !c.supabase.serviceRoleKey)) return 'storageKey'
  return null
}

export function Backups() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { jobs, batches, runningCount, queuedCount, startBatch, cancelJob, cancelBatch, clearFinished } = useJobs()
  const { data: config } = useConfig()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => window.electronAPI.listAccounts() })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo(() => {
    if (!config) return []
    const names = new Map((accounts.data ?? []).map((a) => [a.id, a.name]))
    const byGroup = new Map<string, ConnectionConfig[]>()
    for (const c of config.connections) {
      const group = c.accountId ? (names.get(c.accountId) ?? '—') : t('projects.standalone')
      byGroup.set(group, [...(byGroup.get(group) ?? []), c])
    }
    return [...byGroup.entries()]
  }, [config, accounts.data, t])

  if (!config) return <CenteredSpinner />

  const ready = config.connections.filter((c) => problemWith(c) === null)
  const activeProjectIds = new Set(jobs.filter((j) => j.state === 'queued' || j.state === 'running').map((j) => j.key))
  const singles = jobs.filter((j) => !j.batchId)
  const hasFinished = jobs.some((j) => j.state !== 'queued' && j.state !== 'running')
  const selectedReady = [...selected].filter((id) => ready.some((c) => c.id === id))
  const max = config.settings.maxConcurrentBackups

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function run(ids: string[]) {
    setStarting(true)
    setError(null)
    try {
      const result = await startBatch(ids)
      if (result.skipped.length > 0) setError(t('backups.skipped', { count: result.skipped.length }))
      setSelected(new Set())
    } catch (err: any) {
      setError(err.message ?? t('common.error'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-7 max-w-5xl">
      <PageHeader
        title={t('backups.title')}
        subtitle={
          runningCount + queuedCount > 0
            ? t('backups.activeSummary', { running: runningCount, queued: queuedCount, max })
            : t('backups.idleSummary', { max })
        }
        actions={
          <>
            <button className="btn-secondary" disabled={starting || ready.length === 0} onClick={() => run(ready.map((c) => c.id))}>
              <PlayCircle size={14} />
              {t('backups.backUpAll', { count: ready.length })}
            </button>
            <button className="btn-primary" disabled={starting || selectedReady.length === 0} onClick={() => run(selectedReady)}>
              {starting ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
              {t('backups.backUpSelected', { count: selectedReady.length })}
            </button>
          </>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      <Section
        title={t('backups.projects')}
        action={
          ready.length > 0 && (
            <button
              className="text-[13px] text-brand-400 hover:text-brand-300"
              onClick={() => setSelected(selected.size === ready.length ? new Set() : new Set(ready.map((c) => c.id)))}
            >
              {selected.size === ready.length ? t('backups.clearSelection') : t('backups.selectAll')}
            </button>
          )
        }
      >
        {config.connections.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={t('backups.noProjects.title')}
            body={t('backups.noProjects.body')}
            action={<button className="btn-primary" onClick={() => navigate('/accounts')}>{t('backups.noProjects.action')}</button>}
          />
        ) : (
          <div className="space-y-4">
            {groups.map(([group, projects]) => (
              <div key={group}>
                <p className="text-[12.5px] font-medium text-surface-500 px-1 mb-1.5">{group}</p>
                <ul className="list-group">
                  {projects.map((c) => {
                    const problem = problemWith(c)
                    return (
                      <li key={c.id}>
                        <label className={`list-row min-h-[52px] ${problem ? 'opacity-60' : 'cursor-pointer hover:bg-surface-800/50'}`}>
                          <input type="checkbox" disabled={!!problem} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[14px] text-surface-100 truncate">{c.name}</span>
                            <span className="block text-[12.5px] text-surface-500 truncate">
                              {[c.projectRef ?? c.supabase.url, c.backup.include.join(' + ')].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          {activeProjectIds.has(c.id) && <span className="text-[12px] text-blue-400">{t('backups.inQueue')}</span>}
                          {problem && (
                            <span className="flex items-center gap-1 text-[12px] text-amber-400">
                              <AlertTriangle size={12} />
                              {t(`backups.problems.${problem}`)}
                            </span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={t('backups.queue')}
        action={
          hasFinished && (
            <button className="btn-ghost !px-2 !py-1 text-[13px]" onClick={clearFinished}>
              <Trash2 size={13} />
              {t('backups.clearFinished')}
            </button>
          )
        }
      >
        <div className="space-y-4">
          {jobs.length === 0 && (
            <EmptyState icon={Clock} title={t('backups.nothingRunning.title')} body={t('backups.nothingRunning.body')} />
          )}

          {batches.map((batch) => (
            <BatchCard key={batch.batchId} batch={batch} onCancelBatch={cancelBatch} onCancelJob={cancelJob} />
          ))}

          {singles.length > 0 && (
            <div>
              <p className="text-[12.5px] font-medium text-surface-500 px-1 mb-1.5">{t('backups.singles')}</p>
              <ul className="list-group">
                {singles.map((job) => (
                  <JobRow key={job.id} job={job} onCancel={cancelJob} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

function BatchCard({
  batch,
  onCancelBatch,
  onCancelJob,
}: {
  batch: BatchView
  onCancelBatch: (id: string) => Promise<void>
  onCancelJob: (id: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const done = batch.succeeded + batch.failed + batch.cancelled
  const overall = batch.total === 0 ? 0 : (done / batch.total) * 100

  return (
    <div className="list-group">
      <div className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13.5px] text-surface-200">
            <span className="font-medium">{t('backups.batch')}</span>{' '}
            <span className="text-surface-500">
              {new Date(batch.enqueuedAt).toLocaleTimeString(i18n.language)} · {t('backups.batchProgress', { done, total: batch.total })}
              {batch.failed > 0 && <span className="text-red-400"> · {t('backups.failed', { count: batch.failed })}</span>}
              {batch.cancelled > 0 && <span className="text-amber-400"> · {t('backups.cancelled', { count: batch.cancelled })}</span>}
            </span>
          </div>
          {!batch.finished && (
            <button className="flex items-center gap-1.5 text-[13px] text-surface-400 hover:text-red-400" onClick={() => onCancelBatch(batch.batchId)}>
              <StopCircle size={14} />
              {t('backups.cancelBatch')}
            </button>
          )}
        </div>
        <ProgressBar progress={overall} showPercentage={false} variant={batch.finished ? (batch.failed > 0 ? 'error' : 'success') : 'default'} />
      </div>
      {batch.jobs.map((job) => (
        <JobRow key={job.id} job={job} onCancel={onCancelJob} />
      ))}
    </div>
  )
}

function JobRow({ job, onCancel }: { job: JobView; onCancel: (id: string) => Promise<void> }) {
  const { t } = useTranslation()
  const active = job.state === 'queued' || job.state === 'running'

  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0 text-[14px] text-surface-100 truncate">{job.label}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATE_STYLES[job.state]}`}>
          {job.state === 'running' && <Loader2 size={11} className="animate-spin" />}
          {job.state === 'queued' && <Clock size={11} />}
          {job.state === 'succeeded' && <CheckCircle2 size={11} />}
          {job.state === 'failed' && <XCircle size={11} />}
          {t(`backups.state.${job.state}`)}
        </span>
        {active && (
          <button className="p-1 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10" title={t('common.cancel')} onClick={() => onCancel(job.id)}>
            <StopCircle size={15} />
          </button>
        )}
      </div>

      {job.state === 'running' && (
        <ProgressBar
          progress={job.progress?.progress ?? 0}
          label={`${t(`backups.stage.${job.progress?.stage ?? 'starting'}` as never)} — ${(job.progress?.message ?? '').slice(0, 70)}`}
        />
      )}
      {job.state === 'succeeded' && job.result && (
        <p className="text-[12.5px] text-surface-500">
          {t('backups.result', {
            size: formatBytes(job.result.size),
            duration: formatDuration(job.result.duration),
            destinations: job.result.destinations.join(', '),
          })}
        </p>
      )}
      {job.state === 'failed' && <p className="text-[12.5px] text-red-400 break-words">{(job.error ?? t('common.error')).slice(0, 300)}</p>}
    </li>
  )
}
