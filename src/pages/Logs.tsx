import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ScrollText, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useManagerQuery } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { CenteredSpinner, EmptyState, Notice, PageHeader, Segmented } from '../components/ui'

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-surface-500',
}

export function Logs() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'changes' | 'app'>('changes')
  const [level, setLevel] = useState('')

  const audit = useManagerQuery('audit.list', { limit: 300 }, { enabled: tab === 'changes' })
  const logs = useQuery({
    queryKey: ['logs', level],
    queryFn: () => window.electronAPI.getLogs({ limit: 300, offset: 0, level: level || undefined }),
    enabled: tab === 'app',
  })

  const refetch = () => (tab === 'changes' ? audit.refetch() : logs.refetch())

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title={t('logs.title')}
        subtitle={t('logs.subtitle')}
        actions={
          <button className="btn-secondary" onClick={() => refetch()}>
            <RefreshCw size={14} />
            {t('common.refresh')}
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label={t('logs.title')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'changes', label: t('logs.tabs.changes') },
            { value: 'app', label: t('logs.tabs.app') },
          ]}
        />
        {tab === 'app' && (
          <Segmented
            label={t('logs.levels.all')}
            value={level}
            onChange={setLevel}
            options={[
              { value: '', label: t('logs.levels.all') },
              { value: 'info', label: t('logs.levels.info') },
              { value: 'warn', label: t('logs.levels.warn') },
              { value: 'error', label: t('logs.levels.error') },
            ]}
          />
        )}
      </div>

      {tab === 'changes' ? (
        audit.isLoading ? (
          <CenteredSpinner />
        ) : audit.error ? (
          <Notice tone="error">{audit.error.message}</Notice>
        ) : (audit.data?.length ?? 0) === 0 ? (
          <EmptyState icon={ShieldCheck} title={t('logs.empty.changesTitle')} body={t('logs.empty.changesBody')} />
        ) : (
          <ul className="list-group">
            {audit.data!.map((entry, i) => (
              <li key={i} className="list-row items-start !py-2.5">
                <span className="w-36 shrink-0 text-[12.5px] text-surface-500 pt-0.5">{formatDateTime(entry.at)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] text-surface-100">
                    {(t(`logs.actions.${entry.action}` as never) as string) === `logs.actions.${entry.action}` ? entry.action : t(`logs.actions.${entry.action}` as never)}
                    {entry.project && <span className="text-surface-400"> · {entry.project}</span>}
                  </span>
                  {entry.detail && (
                    <span className="block font-mono text-[12px] text-surface-400 whitespace-pre-wrap break-all max-h-24 overflow-hidden">
                      {entry.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : logs.isLoading ? (
        <CenteredSpinner />
      ) : (logs.data?.length ?? 0) === 0 ? (
        <EmptyState icon={ScrollText} title={t('logs.empty.appTitle')} body={t('logs.empty.appBody')} />
      ) : (
        <ul className="list-group max-h-[640px] overflow-y-auto">
          {logs.data!.map((log, i) => (
            <li key={i} className="px-4 py-2.5 font-mono text-[12px]">
              <div className="flex items-start gap-3">
                <span className="text-surface-500 shrink-0 w-36">{formatDateTime(log.timestamp, { year: undefined })}</span>
                <span className={`uppercase font-bold shrink-0 w-12 ${LEVEL_COLORS[log.level] ?? 'text-surface-400'}`}>{log.level}</span>
                <span className="text-surface-200 break-all">{log.message}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
