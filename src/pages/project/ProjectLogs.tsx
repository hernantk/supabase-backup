import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useManagerQuery } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { CenteredSpinner, EmptyState, Notice, Segmented, Switch } from '../../components/ui'
import { Requires, useWorkspaceProject } from './ProjectWorkspace'
import type { LogSource } from '../../../electron/shared/managerApi'

const SOURCES: LogSource[] = ['api', 'postgres', 'auth', 'functions', 'storage']
const RANGES = [1, 6, 24] as const

export function ProjectLogs() {
  const project = useWorkspaceProject()
  return (
    <Requires need="logs" project={project}>
      <ProjectLogsInner />
    </Requires>
  )
}

/** Colours a line red or amber when it reads like an error or a warning. */
function tone(message: string): string {
  if (/\b(error|fatal|panic|exception)\b|\b5\d\d\b/i.test(message)) return 'text-red-400'
  if (/\b(warn|warning)\b|\b4\d\d\b/i.test(message)) return 'text-amber-400'
  return 'text-surface-200'
}

function ProjectLogsInner() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const [params, setParams] = useSearchParams()
  const initial = params.get('source') as LogSource | null
  const [source, setSource] = useState<LogSource>(initial && SOURCES.includes(initial) ? initial : 'api')
  const [hours, setHours] = useState<(typeof RANGES)[number]>(1)
  const [search, setSearch] = useState('')
  const [auto, setAuto] = useState(false)

  const logs = useManagerQuery(
    'logs.query',
    { connectionId: project.connectionId, source, hours, search: search || undefined },
    { refetchInterval: auto ? 10_000 : false, staleTime: 0 }
  )

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label={t('projects.tabs.logs')}
          value={source}
          onChange={(s) => {
            setSource(s)
            setParams({ source: s }, { replace: true })
          }}
          options={SOURCES.map((s) => ({ value: s, label: t(`insights.logs.sources.${s}`) }))}
        />
        <select className="input !w-auto" value={hours} onChange={(e) => setHours(Number(e.target.value) as (typeof RANGES)[number])}>
          {RANGES.map((h) => (
            <option key={h} value={h}>{t(`insights.logs.range.${h}` as never)}</option>
          ))}
        </select>
        <input className="input !w-56" placeholder={t('insights.logs.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-[13px] text-surface-300 cursor-pointer ml-auto">
          {t('insights.logs.autoRefresh')}
          <Switch label={t('insights.logs.autoRefresh')} checked={auto} onChange={setAuto} />
        </label>
        <button className="btn-secondary !py-1" onClick={() => logs.refetch()}>
          <RefreshCw size={13} className={logs.isFetching ? 'animate-spin' : ''} />
          {t('common.refresh')}
        </button>
      </div>

      {logs.error && <Notice tone="error">{logs.error.message}</Notice>}

      {logs.isLoading ? (
        <CenteredSpinner />
      ) : (logs.data?.length ?? 0) === 0 && !logs.error ? (
        <EmptyState icon={ScrollText} title={t('insights.logs.empty.title')} body={t('insights.logs.empty.body')} />
      ) : (
        <>
          <ul className="list-group max-h-[560px] overflow-y-auto">
            {logs.data?.map((row, i) => (
              <li key={i} className="flex gap-3 px-4 py-2 font-mono text-[12px]">
                <span className="text-surface-500 shrink-0 w-[150px]">
                  {formatDateTime(row.timestamp, { year: undefined, second: '2-digit', hour12: false })}
                </span>
                <span className={`break-all ${tone(row.message)}`}>{row.message}</span>
              </li>
            ))}
          </ul>
          <p className="px-1 text-[12.5px] text-surface-500">
            {t('insights.logs.showing', { count: logs.data?.length ?? 0 })} · {t('insights.logs.note')}
          </p>
        </>
      )}
    </div>
  )
}
