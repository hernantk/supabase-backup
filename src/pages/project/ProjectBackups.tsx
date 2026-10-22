import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, PlayCircle, StopCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfig, useHistory, useUpdateConnection } from '../../hooks/useConfig'
import { useJobs } from '../../contexts/JobsContext'
import { ProgressBar } from '../../components/ProgressBar'
import { BackupHistoryList } from '../../components/BackupHistoryList'
import { Notice, Section, Segmented, Switch } from '../../components/ui'
import { useWorkspaceProject } from './ProjectWorkspace'
import type { BackupInclude, ConnectionConfig } from '../../../electron/preload'

const PRESETS: { key: 'hourly' | 'sixHours' | 'daily' | 'weekly'; cron: string }[] = [
  { key: 'hourly', cron: '0 * * * *' },
  { key: 'sixHours', cron: '0 */6 * * *' },
  { key: 'daily', cron: '0 2 * * *' },
  { key: 'weekly', cron: '0 2 * * 1' },
]

export function ProjectBackups() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const { data: config } = useConfig()
  const { data: history } = useHistory()
  const client = useQueryClient()
  const { jobs, cancelJob } = useJobs()

  const connection = config?.connections.find((c) => c.id === project.connectionId)
  const activeJob = jobs.find((j) => j.key === project.connectionId && (j.state === 'queued' || j.state === 'running'))
  const [include, setInclude] = useState<BackupInclude[]>(['database', 'storage'])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (connection) setInclude(connection.backup.include)
  }, [connection?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!config || !connection) return null

  const destinations = (['local', 's3', 'gcs', 'azure'] as const).filter((d) => config.destinations[d].enabled)
  const accountOnly = project.capabilities.functions

  function toggleInclude(kind: BackupInclude) {
    setInclude((prev) => {
      const next = prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
      return next.length > 0 ? next : prev
    })
  }

  async function backUp() {
    setError(null)
    try {
      // Fire and follow: progress arrives through the job queue.
      void window.electronAPI
        .runBackup({
          connectionId: project.connectionId,
          include,
          destinations,
          compress: connection!.backup.compress,
          encrypt: connection!.backup.encrypt,
        })
        .catch((err: Error) => setError(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
        .finally(() => client.invalidateQueries({ queryKey: ['history'] }))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const projectHistory = (history ?? []).filter((r) => r.connectionId === project.connectionId)

  return (
    <div className="space-y-8 max-w-3xl">
      {error && <Notice tone="error">{error}</Notice>}

      <Section title={t('backups.backUpNow')}>
        <div className="list-group">
          {activeJob ? (
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-[14px] text-surface-100">
                  <Loader2 size={15} className="animate-spin text-brand-400" />
                  {activeJob.state === 'queued' ? t('backups.state.queued') : t('backups.running')}
                </span>
                <button className="btn-ghost !text-red-400 hover:!bg-red-500/10 !py-1" onClick={() => cancelJob(activeJob.id)}>
                  <StopCircle size={14} />
                  {t('common.cancel')}
                </button>
              </div>
              {activeJob.state === 'running' && (
                <ProgressBar
                  progress={activeJob.progress?.progress ?? 0}
                  label={`${t(`backups.stage.${activeJob.progress?.stage ?? 'starting'}` as never)} — ${activeJob.progress?.message ?? ''}`.slice(0, 90)}
                />
              )}
            </div>
          ) : (
            <>
              <IncludeRow
                label={t('backups.contentDatabase')}
                hint={t('backups.contentDatabaseHint')}
                checked={include.includes('database')}
                onChange={() => toggleInclude('database')}
              />
              <IncludeRow
                label={t('backups.contentStorage')}
                hint={t('backups.contentStorageHint')}
                checked={include.includes('storage')}
                onChange={() => toggleInclude('storage')}
              />
              {accountOnly && (
                <>
                  <IncludeRow
                    label={t('backups.contentFunctions')}
                    hint={t('backups.contentFunctionsHint')}
                    checked={include.includes('functions')}
                    onChange={() => toggleInclude('functions')}
                  />
                  <IncludeRow
                    label={t('backups.contentConfig')}
                    hint={t('backups.contentConfigHint')}
                    checked={include.includes('config')}
                    onChange={() => toggleInclude('config')}
                  />
                </>
              )}
              <div className="list-row justify-between">
                <span className="text-[13px] text-surface-400">
                  {destinations.length > 0 ? `${t('backups.destinationsTitle')}: ${destinations.join(', ')}` : t('backups.noDestinations')}
                </span>
                <button className="btn-primary" disabled={destinations.length === 0} onClick={backUp}>
                  <PlayCircle size={14} />
                  {t('backups.backUpNow')}
                </button>
              </div>
            </>
          )}
        </div>
      </Section>

      <SchedulePanel connection={connection} />
      <ProcessingPanel connection={connection} />

      <Section title={t('backups.history')}>
        <BackupHistoryList
          records={projectHistory}
          showProject={false}
          onDelete={async (id) => {
            await window.electronAPI.deleteBackupRecord(id)
            await client.invalidateQueries({ queryKey: ['history'] })
          }}
        />
      </Section>
    </div>
  )
}

function IncludeRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="list-row cursor-pointer">
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] text-surface-100">{label}</span>
        <span className="block text-[12.5px] text-surface-500">{hint}</span>
      </span>
      <Switch label={label} checked={checked} onChange={onChange} />
    </label>
  )
}

function SchedulePanel({ connection }: { connection: ConnectionConfig }) {
  const { t, i18n } = useTranslation()
  const { update } = useUpdateConnection()
  const [cron, setCron] = useState(connection.schedule.cron)
  const [validation, setValidation] = useState<{ valid: boolean; nextRun: string | null } | null>(null)

  useEffect(() => setCron(connection.schedule.cron), [connection.id, connection.schedule.cron])

  useEffect(() => {
    let live = true
    window.electronAPI.validateCron(cron).then((v) => live && setValidation(v))
    return () => { live = false }
  }, [cron])

  const preset = PRESETS.find((p) => p.cron === cron)?.key ?? 'custom'
  const setSchedule = (patch: Partial<ConnectionConfig['schedule']>) =>
    update(connection.id, (c) => ({ ...c, schedule: { ...c.schedule, ...patch } }))

  return (
    <Section title={t('backups.schedule')}>
      <div className="list-group">
        <label className="list-row cursor-pointer">
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] text-surface-100">{t('backups.scheduleEnabled')}</span>
            <span className="block text-[12.5px] text-surface-500">{t('backups.scheduleEnabledHint')}</span>
          </span>
          <Switch label={t('backups.scheduleEnabled')} checked={connection.schedule.enabled} onChange={(v) => setSchedule({ enabled: v })} />
        </label>
        {connection.schedule.enabled && (
          <>
            <div className="list-row justify-between">
              <span className="text-[14px] text-surface-100">{t('backups.frequency')}</span>
              <select
                className="input !w-auto"
                value={preset}
                onChange={(e) => {
                  const chosen = PRESETS.find((p) => p.key === e.target.value)
                  if (chosen) setSchedule({ cron: chosen.cron })
                  else setCron(cron)
                }}
              >
                {PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>{t(`backups.presets.${p.key}`)}</option>
                ))}
                <option value="custom">{t('backups.presets.custom')}</option>
              </select>
            </div>
            <div className="list-row justify-between">
              <span className="text-[14px] text-surface-100">{t('backups.cron')}</span>
              <div className="text-right">
                <input
                  className="input !w-44 font-mono text-right"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  onBlur={() => validation?.valid && cron !== connection.schedule.cron && setSchedule({ cron })}
                />
                <p className={`mt-1 text-[12px] ${validation?.valid ? 'text-surface-500' : 'text-red-400'}`}>
                  {validation?.valid && validation.nextRun
                    ? t('backups.nextRun', { when: new Date(validation.nextRun).toLocaleString(i18n.language) })
                    : t('backups.invalidCron')}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </Section>
  )
}

function ProcessingPanel({ connection }: { connection: ConnectionConfig }) {
  const { t } = useTranslation()
  const { update } = useUpdateConnection()
  const [password, setPassword] = useState(connection.backup.encryptionPassword)

  useEffect(() => {
    setPassword(connection.backup.encryptionPassword)
  }, [connection.id, connection.backup.encryptionPassword])

  const setBackup = (patch: Partial<ConnectionConfig['backup']>) =>
    update(connection.id, (c) => ({ ...c, backup: { ...c.backup, ...patch } }))

  return (
    <Section title={t('backups.processing')}>
      <div className="list-group">
        <label className="list-row cursor-pointer">
          <span className="flex-1 text-[14px] text-surface-100">{t('backups.compress')}</span>
          <Switch label={t('backups.compress')} checked={connection.backup.compress} onChange={(v) => setBackup({ compress: v })} />
        </label>
        <label className="list-row cursor-pointer">
          <span className="flex-1 text-[14px] text-surface-100">{t('backups.encrypt')}</span>
          <Switch label={t('backups.encrypt')} checked={connection.backup.encrypt} onChange={(v) => setBackup({ encrypt: v })} />
        </label>
        {connection.backup.encrypt && (
          <div className="list-row">
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] text-surface-100">{t('backups.encryptionPassword')}</span>
              <span className="block text-[12.5px] text-surface-500">{t('backups.encryptionPasswordHint')}</span>
            </span>
            <input
              className="input !w-56"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => password !== connection.backup.encryptionPassword && setBackup({ encryptionPassword: password })}
            />
          </div>
        )}
        <label className="list-row cursor-pointer">
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] text-surface-100">{t('backups.retention')}</span>
            <span className="block text-[12.5px] text-surface-500">{t('backups.retentionHint')}</span>
          </span>
          <Switch
            label={t('backups.retention')}
            checked={connection.backup.retention.enabled}
            onChange={(v) => setBackup({ retention: { ...connection.backup.retention, enabled: v } })}
          />
        </label>
        {connection.backup.retention.enabled && <RetentionFields connection={connection} onChange={(retention) => setBackup({ retention })} />}
      </div>
    </Section>
  )
}

type Retention = ConnectionConfig['backup']['retention']

const LAYERED_DEFAULTS = { keepLast: 3, keepDaily: 7, keepWeekly: 4, keepMonthly: 6 }

function RetentionFields({ connection, onChange }: { connection: ConnectionConfig; onChange: (r: Retention) => void }) {
  const { t } = useTranslation()
  const r = connection.backup.retention
  const layered = (r.keepDaily ?? 0) > 0 || (r.keepWeekly ?? 0) > 0 || (r.keepMonthly ?? 0) > 0

  return (
    <>
      <div className="list-row justify-between">
        <span className="text-[14px] text-surface-100">{t('backups.retentionMode')}</span>
        <Segmented
          label={t('backups.retentionMode')}
          value={layered ? 'layered' : 'simple'}
          onChange={(mode) =>
            onChange(mode === 'layered' ? { enabled: true, ...LAYERED_DEFAULTS } : { enabled: true, keepLast: Math.max(1, r.keepLast) })
          }
          options={[
            { value: 'simple', label: t('backups.retentionSimple') },
            { value: 'layered', label: t('backups.retentionLayered') },
          ]}
        />
      </div>
      <NumberRow label={t('backups.keepLast')} value={r.keepLast} min={layered ? 0 : 1} onChange={(keepLast) => onChange({ ...r, keepLast })} />
      {layered && (
        <>
          <NumberRow label={t('backups.keepDaily')} unit={t('backups.days')} value={r.keepDaily ?? 0} onChange={(keepDaily) => onChange({ ...r, keepDaily })} />
          <NumberRow label={t('backups.keepWeekly')} unit={t('backups.weeks')} value={r.keepWeekly ?? 0} onChange={(keepWeekly) => onChange({ ...r, keepWeekly })} />
          <NumberRow label={t('backups.keepMonthly')} unit={t('backups.months')} value={r.keepMonthly ?? 0} onChange={(keepMonthly) => onChange({ ...r, keepMonthly })} />
          <p className="px-4 py-3 text-[12.5px] text-surface-500">{t('backups.layeredHint')}</p>
        </>
      )}
    </>
  )
}

function NumberRow({ label, unit, value, min = 0, onChange }: { label: string; unit?: string; value: number; min?: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <div className="list-row justify-between">
      <span className="text-[14px] text-surface-100">{label}</span>
      <span className="inline-flex items-center gap-2">
        <input
          className="input !w-20 text-right"
          type="number"
          min={min}
          max={365}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = Math.min(365, Math.max(min, Math.floor(Number(text) || 0)))
            setText(String(n))
            if (n !== value) onChange(n)
          }}
        />
        {unit && <span className="text-[12.5px] text-surface-500 w-14">{unit}</span>}
      </span>
    </div>
  )
}
