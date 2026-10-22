import { useMemo, useState } from 'react'
import { ChevronRight, GitCompare, Layers, Table2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { call, useManagerQuery } from '../../lib/api'
import { useProjects } from '../../hooks/useProjects'
import { CenteredSpinner, EmptyState, Notice, Segmented, Section, Spinner } from '../../components/ui'
import { Requires, useWorkspaceProject } from './ProjectWorkspace'
import type { SchemaChange, SchemaColumn } from '../../../electron/shared/managerApi'

type View = 'columns' | 'migrations' | 'compare'

export function Schema() {
  const project = useWorkspaceProject()
  return (
    <Requires need="sql" project={project}>
      <SchemaInner />
    </Requires>
  )
}

function SchemaInner() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const [view, setView] = useState<View>('columns')

  return (
    <div className="space-y-5 max-w-5xl">
      <Segmented
        label={t('projects.tabs.schema')}
        value={view}
        onChange={setView}
        options={(['columns', 'migrations', 'compare'] as const)
          .filter((v) => v !== 'migrations' || project.capabilities.migrations)
          .map((v) => ({ value: v, label: t(`insights.schema.views.${v}`) }))}
      />
      {view === 'columns' && <ColumnsView />}
      {view === 'migrations' && <MigrationsView />}
      {view === 'compare' && <CompareView />}
    </div>
  )
}

function ColumnsView() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const schema = useManagerQuery('schema.get', { connectionId: project.connectionId })
  const [open, setOpen] = useState<Set<string>>(new Set())

  const tables = useMemo(() => {
    const byTable = new Map<string, SchemaColumn[]>()
    for (const c of schema.data ?? []) {
      const key = `${c.schema}.${c.table}`
      byTable.set(key, [...(byTable.get(key) ?? []), c])
    }
    return [...byTable.entries()]
  }, [schema.data])

  if (schema.isLoading) return <CenteredSpinner />
  if (schema.error) return <Notice tone="error">{schema.error.message}</Notice>
  if (tables.length === 0) return <EmptyState icon={Table2} title={t('insights.schema.noTables.title')} body={t('insights.schema.noTables.body')} />

  return (
    <ul className="list-group">
      {tables.map(([name, columns]) => {
        const isOpen = open.has(name)
        return (
          <li key={name}>
            <button
              className="list-row w-full text-left hover:bg-surface-800/50"
              aria-expanded={isOpen}
              onClick={() => {
                const next = new Set(open)
                if (next.has(name)) next.delete(name)
                else next.add(name)
                setOpen(next)
              }}
            >
              <ChevronRight size={14} className={`text-surface-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              <span className="flex-1 font-mono text-[13.5px] text-surface-100">{name}</span>
              <span className="text-[12.5px] text-surface-500">{t('insights.schema.columnsCount', { count: columns.length })}</span>
            </button>
            {isOpen && (
              <ul className="bg-surface-950/50 px-4 py-2">
                {columns.map((c) => (
                  <li key={c.column} className="flex items-baseline gap-3 py-1 font-mono text-[12.5px]">
                    <span className="w-52 shrink-0 text-surface-100 truncate">{c.column}</span>
                    <span className="text-brand-400">{c.type}</span>
                    {!c.nullable && <span className="text-surface-500">{t('insights.schema.notNull')}</span>}
                    {c.default && <span className="text-surface-500 truncate">= {c.default}</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function MigrationsView() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const migrations = useManagerQuery('migrations.list', { connectionId: project.connectionId })

  if (migrations.isLoading) return <CenteredSpinner />
  if (migrations.error) return <Notice tone="error">{migrations.error.message}</Notice>
  if ((migrations.data?.length ?? 0) === 0) {
    return <EmptyState icon={Layers} title={t('insights.schema.migrations.empty.title')} body={t('insights.schema.migrations.empty.body')} />
  }

  return (
    <Section title={t('insights.schema.migrations.applied')}>
      <ul className="list-group">
        {migrations.data!.map((m) => (
          <li key={m.version} className="list-row">
            <span className="w-40 shrink-0 font-mono text-[12.5px] text-surface-400">{m.version}</span>
            <span className="text-[14px] text-surface-100">{m.name ?? '—'}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function describeChange(c: SchemaChange, t: (k: never, o?: Record<string, unknown>) => string): string {
  const table = `${c.schema}.${c.table}`
  switch (c.kind) {
    case 'table-added':
    case 'table-removed':
      return t('insights.schema.compare.tableOnly' as never, { table })
    case 'column-added':
    case 'column-removed':
      return t('insights.schema.compare.columnOnly' as never, { table, column: c.column, type: c.type })
    case 'column-changed':
      return t('insights.schema.compare.columnChanged' as never, { table, column: c.column, from: c.from, to: c.to })
  }
}

function CompareView() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const { data } = useProjects()
  const others = (data?.projects ?? []).filter((p) => p.connectionId !== project.connectionId && p.capabilities.sql)
  const [otherId, setOtherId] = useState('')

  const compare = useMutation({
    mutationFn: () => call('schema.diff', { left: project.connectionId, right: otherId || others[0].connectionId }),
  })

  if (others.length === 0) return <Notice tone="info">{t('insights.schema.compare.needsOther')}</Notice>
  const other = others.find((p) => p.connectionId === (otherId || others[0].connectionId))!
  const changes = compare.data ?? []
  const onlyHere = changes.filter((c) => c.kind === 'table-removed' || c.kind === 'column-removed')
  const onlyThere = changes.filter((c) => c.kind === 'table-added' || c.kind === 'column-added')
  const different = changes.filter((c) => c.kind === 'column-changed')

  const group = (title: string, items: SchemaChange[], tone: string) =>
    items.length > 0 && (
      <Section title={title}>
        <ul className="list-group">
          {items.map((c, i) => (
            <li key={i} className={`list-row font-mono text-[12.5px] ${tone}`}>
              {describeChange(c, t as never)}
            </li>
          ))}
        </ul>
      </Section>
    )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[13.5px] text-surface-300">{t('insights.schema.compare.with')}</label>
        <select className="input !w-64" value={otherId || others[0].connectionId} onChange={(e) => { setOtherId(e.target.value); compare.reset() }}>
          {others.map((p) => (
            <option key={p.connectionId} value={p.connectionId}>{p.name}</option>
          ))}
        </select>
        <button className="btn-primary" disabled={compare.isPending} onClick={() => compare.mutate()}>
          {compare.isPending ? <Spinner className="!text-current" /> : <GitCompare size={14} />}
          {compare.isPending ? t('insights.schema.compare.running') : t('insights.schema.compare.run')}
        </button>
      </div>
      <p className="px-1 text-[12.5px] text-surface-500">{t('insights.schema.compare.hint')}</p>

      {compare.error && <Notice tone="error">{compare.error.message}</Notice>}
      {compare.data && changes.length === 0 && (
        <EmptyState icon={GitCompare} title={t('insights.schema.compare.same.title')} body={t('insights.schema.compare.same.body')} />
      )}
      {changes.length > 0 && (
        <>
          <p className="px-1 text-[13px] text-surface-400">{t('insights.schema.compare.count', { count: changes.length })}</p>
          {group(t('insights.schema.compare.onlyHere', { name: project.name }), onlyHere, 'text-amber-400')}
          {group(t('insights.schema.compare.onlyThere', { name: other.name }), onlyThere, 'text-emerald-400')}
          {group(t('insights.schema.compare.changed'), different, 'text-blue-400')}
        </>
      )}
    </div>
  )
}
