import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  StopCircle,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useJobs, type BatchView, type JobView } from '../contexts/JobsContext'
import { ProgressBar } from '../components/ProgressBar'
import type { AccountSummary, AppConfig, ConnectionConfig } from '../../electron/preload'

const STAGE_LABELS: Record<string, string> = {
  database: 'Database',
  storage: 'Storage',
  compress: 'Compressing',
  encrypt: 'Encrypting',
  upload: 'Uploading',
}

const STATE_STYLES: Record<JobView['state'], { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-surface-500/10 text-surface-400 border-surface-500/20' },
  running: { label: 'Running', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  succeeded: { label: 'Done', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  cancelled: { label: 'Cancelled', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/** Why a project cannot be backed up as configured, or null when it is ready. */
function problemWith(c: ConnectionConfig): string | null {
  if (!c.supabase.url && !c.supabase.dbUrl) return 'Not configured'
  if (c.backup.include.includes('database') && !c.supabase.dbUrl) {
    return c.projectRef ? 'Database password missing' : 'Database URL missing'
  }
  if (c.backup.include.includes('storage') && (!c.supabase.url || !c.supabase.serviceRoleKey)) {
    return 'Storage key missing'
  }
  return null
}

export function Backups() {
  const navigate = useNavigate()
  const { jobs, batches, activeCount, runningCount, queuedCount, startBatch, cancelJob, cancelBatch, clearFinished } =
    useJobs()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([window.electronAPI.getConfig(), window.electronAPI.listAccounts()])
      .then(([cfg, accs]) => {
        setConfig(cfg)
        setAccounts(accs)
      })
      .catch((err) => setError(err.message))
  }, [])

  const groups = useMemo(() => {
    if (!config) return []
    const names = new Map(accounts.map((a) => [a.id, a.name]))
    const byGroup = new Map<string, ConnectionConfig[]>()
    for (const c of config.connections) {
      const group = c.accountId ? (names.get(c.accountId) ?? 'Account') : 'Standalone projects'
      byGroup.set(group, [...(byGroup.get(group) ?? []), c])
    }
    return [...byGroup.entries()]
  }, [config, accounts])

  const ready = useMemo(
    () => (config?.connections ?? []).filter((c) => problemWith(c) === null),
    [config]
  )
  const activeProjectIds = new Set(jobs.filter((j) => j.state === 'queued' || j.state === 'running').map((j) => j.key))
  const singles = jobs.filter((j) => !j.batchId)
  const hasFinished = jobs.some((j) => j.state !== 'queued' && j.state !== 'running')

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
      if (result.skipped.length > 0) setError(`${result.skipped.length} project(s) no longer exist and were skipped.`)
      setSelected(new Set())
    } catch (err: any) {
      setError(err.message ?? 'Could not start the backups')
    } finally {
      setStarting(false)
    }
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const selectedReady = [...selected].filter((id) => ready.some((c) => c.id === id))

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Backups</h1>
          <p className="text-surface-400 mt-1">
            Back up several projects at once.{' '}
            {activeCount > 0
              ? `${runningCount} running, ${queuedCount} queued (up to ${config.settings.maxConcurrentBackups} at a time).`
              : `Up to ${config.settings.maxConcurrentBackups} run at a time.`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            className="btn-secondary flex items-center gap-2"
            disabled={starting || ready.length === 0}
            onClick={() => run(ready.map((c) => c.id))}
          >
            <PlayCircle size={16} />
            Back up all ({ready.length})
          </button>
          <button
            className="btn-primary flex items-center gap-2"
            disabled={starting || selectedReady.length === 0}
            onClick={() => run(selectedReady)}
          >
            {starting ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
            Back up selected ({selectedReady.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Project picker */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="section-title !mb-0">Projects</h2>
          {ready.length > 0 && (
            <button
              className="text-sm text-brand-400 hover:text-brand-300"
              onClick={() => setSelected(selected.size === ready.length ? new Set() : new Set(ready.map((c) => c.id)))}
            >
              {selected.size === ready.length ? 'Clear selection' : 'Select all'}
            </button>
          )}
        </div>

        {config.connections.length === 0 ? (
          <p className="text-sm text-surface-400">
            No projects yet.{' '}
            <button className="text-brand-400 hover:text-brand-300" onClick={() => navigate('/accounts')}>
              Add an account
            </button>{' '}
            or create a project in Settings.
          </p>
        ) : (
          groups.map(([group, projects]) => (
            <div key={group}>
              <p className="text-[12.5px] font-medium text-surface-500 px-1 mb-1.5">{group}</p>
              <ul className="list-group">
                {projects.map((c) => {
                  const problem = problemWith(c)
                  const busy = activeProjectIds.has(c.id)
                  return (
                    <li key={c.id}>
                      <label
                        className={`flex items-center gap-3 px-4 py-2.5 min-h-[52px] ${problem ? 'opacity-60' : 'cursor-pointer hover:bg-surface-800/50'}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!!problem}
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                          className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-surface-100 truncate">{c.name}</span>
                          <span className="block text-xs text-surface-500 truncate">
                            {[c.projectRef ?? c.supabase.url, c.backup.include.join(' + ')].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {busy && <span className="text-xs text-blue-400">in queue</span>}
                        {problem && (
                          <span className="flex items-center gap-1 text-xs text-amber-400">
                            <AlertTriangle size={12} />
                            {problem}
                          </span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title !mb-0">Queue</h2>
          {hasFinished && (
            <button className="btn-ghost flex items-center gap-1.5 text-sm" onClick={clearFinished}>
              <Trash2 size={14} />
              Clear finished
            </button>
          )}
        </div>

        {jobs.length === 0 && (
          <div className="list-group px-4 py-5 text-[13.5px] text-surface-400">
            Nothing running. Select projects above and start a batch; scheduled backups show up here too.
          </div>
        )}

        {batches.map((batch) => (
          <BatchCard key={batch.batchId} batch={batch} onCancelBatch={cancelBatch} onCancelJob={cancelJob} />
        ))}

        {singles.length > 0 && (
          <div className="card !p-0 overflow-hidden">
            <p className="px-4 py-2.5 text-xs uppercase tracking-wide text-surface-500 border-b border-surface-800">
              Single and scheduled backups
            </p>
            <ul className="divide-y divide-surface-800">
              {singles.map((job) => (
                <JobRow key={job.id} job={job} onCancel={cancelJob} />
              ))}
            </ul>
          </div>
        )}
      </div>
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
  const done = batch.succeeded + batch.failed + batch.cancelled
  const overall = batch.total === 0 ? 0 : (done / batch.total) * 100

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-800 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-surface-200">
            <span className="font-medium">Batch</span>{' '}
            <span className="text-surface-500">
              {new Date(batch.enqueuedAt).toLocaleTimeString()} · {done}/{batch.total} finished
              {batch.failed > 0 && <span className="text-red-400"> · {batch.failed} failed</span>}
              {batch.cancelled > 0 && <span className="text-amber-400"> · {batch.cancelled} cancelled</span>}
            </span>
          </div>
          {!batch.finished && (
            <button
              className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-red-400"
              onClick={() => onCancelBatch(batch.batchId)}
            >
              <StopCircle size={14} />
              Cancel batch
            </button>
          )}
        </div>
        <ProgressBar
          progress={overall}
          showPercentage={false}
          variant={batch.finished ? (batch.failed > 0 ? 'error' : 'success') : 'default'}
        />
      </div>
      <ul className="divide-y divide-surface-800">
        {batch.jobs.map((job) => (
          <JobRow key={job.id} job={job} onCancel={onCancelJob} />
        ))}
      </ul>
    </div>
  )
}

function JobRow({ job, onCancel }: { job: JobView; onCancel: (id: string) => Promise<void> }) {
  const style = STATE_STYLES[job.state]
  const active = job.state === 'queued' || job.state === 'running'

  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0 text-sm text-surface-100 truncate">{job.label}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.className}`}>
          {job.state === 'running' && <Loader2 size={11} className="animate-spin" />}
          {job.state === 'queued' && <Clock size={11} />}
          {job.state === 'succeeded' && <CheckCircle2 size={11} />}
          {job.state === 'failed' && <XCircle size={11} />}
          {style.label}
        </span>
        {active && (
          <button
            className="p-1 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10"
            title="Cancel"
            onClick={() => onCancel(job.id)}
          >
            <StopCircle size={15} />
          </button>
        )}
      </div>

      {job.state === 'running' && (
        <ProgressBar
          progress={job.progress?.progress ?? 0}
          label={`${STAGE_LABELS[job.progress?.stage ?? ''] ?? 'Starting'} — ${truncate(job.progress?.message ?? '', 70)}`}
        />
      )}
      {job.state === 'succeeded' && job.result && (
        <p className="text-xs text-surface-500">
          {formatBytes(job.result.size)} in {formatDuration(job.result.duration)} · {job.result.destinations.join(', ')}
        </p>
      )}
      {job.state === 'failed' && <p className="text-xs text-red-400 break-words">{truncate(job.error ?? 'Backup failed', 300)}</p>}
    </li>
  )
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
