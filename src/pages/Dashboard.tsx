import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, PlayCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfig, useHistory } from '../hooks/useConfig'
import { BackupHistoryList } from '../components/BackupHistoryList'
import { CenteredSpinner, InfoRow, PageHeader, Section } from '../components/ui'
import { formatBytes, formatDateTime, formatDuration } from '../lib/format'

const RECENT = 8

export function Dashboard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { data: history, isLoading } = useHistory()
  const { data: config } = useConfig()
  const scheduler = useQuery({
    queryKey: ['scheduler'],
    queryFn: () => window.electronAPI.getSchedulerStatus(),
    refetchInterval: 30_000,
  })
  const [expanded, setExpanded] = useState(false)

  if (isLoading || !history) return <CenteredSpinner />

  const successCount = history.filter((r) => r.status === 'success').length
  const failedCount = history.filter((r) => r.status === 'failed').length
  const totalSize = history.reduce((acc, r) => acc + r.size, 0)
  const last = history[0]
  const local = config?.destinations.local
  const schedules = scheduler.data?.connections ?? []

  const stats = [
    { label: t('dashboard.stats.total'), value: history.length.toLocaleString(i18n.language) },
    { label: t('dashboard.stats.successful'), value: successCount.toLocaleString(i18n.language), tone: 'text-emerald-400' },
    { label: t('dashboard.stats.failed'), value: failedCount.toLocaleString(i18n.language), tone: failedCount > 0 ? 'text-red-400' : '' },
    { label: t('dashboard.stats.size'), value: formatBytes(totalSize) },
  ]

  return (
    <div className="space-y-8 max-w-5xl">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <>
            {local?.enabled && local.path && (
              <button className="btn-secondary" onClick={() => window.electronAPI.openFolder(local.path)}>
                <FolderOpen size={14} />
                {t('dashboard.openFolder')}
              </button>
            )}
            <button className="btn-primary" onClick={() => navigate('/backups')}>
              <PlayCircle size={14} />
              {t('dashboard.backUp')}
            </button>
          </>
        }
      />

      <div className="list-group !divide-y-0 grid grid-cols-2 md:grid-cols-4 md:divide-x divide-surface-700/60">
        {stats.map((s) => (
          <div key={s.label} className="px-5 py-4">
            <p className="text-[12.5px] text-surface-400">{s.label}</p>
            <p className={`text-[26px] leading-tight font-semibold tracking-tight mt-0.5 ${s.tone ?? 'text-surface-50'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title={t('dashboard.lastBackup')}>
          {last ? (
            <div className="list-group">
              <InfoRow label={t('dashboard.connection')}>{last.connectionName ?? '—'}</InfoRow>
              <InfoRow label={t('common.status')}>
                <span className={last.status === 'success' ? 'text-emerald-400' : last.status === 'failed' ? 'text-red-400' : 'text-blue-400'}>
                  {t(`backups.state.${last.status === 'success' ? 'succeeded' : last.status}`)}
                </span>
              </InfoRow>
              <InfoRow label={t('dashboard.time')}>{formatDateTime(last.timestamp)}</InfoRow>
              <InfoRow label={t('common.size')}>{formatBytes(last.size)}</InfoRow>
              <InfoRow label={t('common.duration')}>{formatDuration(last.duration)}</InfoRow>
            </div>
          ) : (
            <div className="list-group px-4 py-5">
              <p className="text-[14px] text-surface-100">{t('dashboard.noBackups')}</p>
              <p className="text-[12.5px] text-surface-500 mt-0.5">{t('dashboard.noBackupsHint')}</p>
            </div>
          )}
        </Section>

        <Section
          title={t('dashboard.schedules')}
          action={schedules.length > 0 && <span className="text-[12.5px] text-surface-500">{t('dashboard.activeSchedules', { count: schedules.length })}</span>}
        >
          {schedules.length > 0 ? (
            <ul className="list-group">
              {schedules.map((s) => (
                <li key={s.connectionId} className="list-row min-h-[52px]">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${s.running ? 'bg-brand-400 animate-pulse' : s.lastStatus === 'failed' ? 'bg-red-400' : 'bg-emerald-400'}`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] text-surface-100 truncate">{s.connectionName}</span>
                    <span className="block text-[12.5px] text-surface-500 truncate" title={s.lastError ?? undefined}>
                      {s.running
                        ? t('dashboard.queued')
                        : s.lastStatus === 'failed'
                          ? `${t('dashboard.lastFailed')}${s.lastError ? `: ${s.lastError}` : ''}`
                          : s.nextRun
                            ? t('dashboard.nextRun', { when: new Date(s.nextRun).toLocaleString(i18n.language) })
                            : ''}
                    </span>
                  </span>
                  <span className="font-mono text-[12px] text-surface-500 shrink-0">{s.cron}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="list-group px-4 py-5">
              <p className="text-[14px] text-surface-100">{t('dashboard.noSchedules')}</p>
              <p className="text-[12.5px] text-surface-500 mt-0.5">{t('dashboard.noSchedulesHint')}</p>
            </div>
          )}
        </Section>
      </div>

      <Section
        title={t('dashboard.recent')}
        action={
          history.length > RECENT && (
            <button className="text-[13px] text-brand-400 hover:text-brand-300" onClick={() => setExpanded(!expanded)}>
              {expanded ? t('dashboard.showLess') : t('dashboard.showMore')}
            </button>
          )
        }
      >
        <BackupHistoryList
          records={expanded ? history : history.slice(0, RECENT)}
          onDelete={async (id) => {
            await window.electronAPI.deleteBackupRecord(id)
            await client.invalidateQueries({ queryKey: ['history'] })
          }}
        />
      </Section>
    </div>
  )
}
