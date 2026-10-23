import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, Plus, RefreshCw, Table2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call, useManagerQuery } from '../../lib/api'
import { cellText } from '../../components/ResultTable'
import { CenteredSpinner, ConfirmSheet, EmptyState, Notice, Sheet, Spinner } from '../../components/ui'
import { Requires, SideItem, SplitView, useWorkspaceProject } from './ProjectWorkspace'
import type { CellValue, ColumnInfo, FilterOp, MutationOutcome, RowFilter, TableInfo } from '../../../electron/shared/managerApi'

const PAGE_SIZE = 50
const OPS: FilterOp[] = ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'isnull', 'notnull']

export function TableEditor() {
  const project = useWorkspaceProject()
  return (
    <Requires need="sql" project={project}>
      <TableEditorInner />
    </Requires>
  )
}

function TableEditorInner() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const tables = useManagerQuery('tables.list', { connectionId: project.connectionId })
  const [selected, setSelected] = useState<TableInfo | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (tables.data ?? []).filter((x) => !needle || `${x.schema}.${x.name}`.toLowerCase().includes(needle))
  }, [tables.data, search])

  return (
    <SplitView
      title={t('projects.tabs.tables')}
      side={
        <>
          <div className="px-3 pb-2">
            <input className="input !py-[5px] text-[13px]" placeholder={t('tableEditor.searchTables')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {tables.isLoading ? (
            <CenteredSpinner />
          ) : tables.error ? (
            <div className="px-3"><Notice tone="error">{tables.error.message}</Notice></div>
          ) : filtered.length === 0 ? (
            <p className="px-4 text-[13px] text-surface-500">{t('tableEditor.noTables.body')}</p>
          ) : (
            <ul className="px-2 pb-3 space-y-px">
              {filtered.map((x) => (
                <li key={`${x.schema}.${x.name}`}>
                  <SideItem active={selected?.schema === x.schema && selected.name === x.name} onClick={() => setSelected(x)}>
                    {x.kind === 'table' ? <Table2 size={14} className="shrink-0" /> : <Eye size={14} className="shrink-0" />}
                    <span className="truncate">{x.name}</span>
                    {x.schema !== 'public' && <span className="ml-auto text-[11px] text-surface-500 truncate">{x.schema}</span>}
                  </SideItem>
                </li>
              ))}
            </ul>
          )}
        </>
      }
    >
        {selected ? (
          <TableGrid key={`${selected.schema}.${selected.name}`} table={selected} />
        ) : (
          <EmptyState
            icon={Table2}
            title={(tables.data?.length ?? 0) === 0 && !tables.isLoading ? t('tableEditor.noTables.title') : t('tableEditor.pick.title')}
            body={(tables.data?.length ?? 0) === 0 && !tables.isLoading ? t('tableEditor.noTables.body') : t('tableEditor.pick.body')}
          />
        )}
    </SplitView>
  )
}

type Pending = { reasons: string[]; run: () => Promise<unknown> } | null

function TableGrid({ table }: { table: TableInfo }) {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const client = useQueryClient()
  const base = { connectionId: project.connectionId, schema: table.schema, table: table.name }

  const [page, setPage] = useState(0)
  const [orderBy, setOrderBy] = useState<string | undefined>()
  const [descending, setDescending] = useState(false)
  const [filter, setFilter] = useState<RowFilter | undefined>()
  const [draftFilter, setDraftFilter] = useState<RowFilter>({ column: '', op: 'eq', value: '' })
  const [editing, setEditing] = useState<{ row: number; column: string } | null>(null)
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [inserting, setInserting] = useState(false)
  const [deleting, setDeleting] = useState<Record<string, unknown> | null>(null)
  const [pending, setPending] = useState<Pending>(null)

  const query = useManagerQuery('tables.rows', { ...base, limit: PAGE_SIZE, offset: page * PAGE_SIZE, orderBy, descending, filter })
  const columns = query.data?.columns ?? []
  const pkColumns = columns.filter((c) => c.primaryKey).map((c) => c.name)
  const editable = table.kind === 'table' && pkColumns.length > 0

  const refresh = () => client.invalidateQueries({ queryKey: ['tables.rows'] })

  function matchOf(row: Record<string, unknown>): Record<string, string | null> {
    return Object.fromEntries(pkColumns.map((c) => [c, row[c] === null || row[c] === undefined ? null : cellText(row[c])]))
  }

  /** Runs a mutation, asking for confirmation first when the project is protected. */
  async function mutate<T>(run: (confirmed: boolean) => Promise<MutationOutcome<T>>, done: string) {
    setToast(null)
    try {
      const outcome = await run(false)
      if (outcome.status === 'confirm') {
        setPending({
          reasons: outcome.reasons,
          run: async () => {
            await run(true)
            setToast({ tone: 'success', text: done })
            await refresh()
          },
        })
        return
      }
      setToast({ tone: 'success', text: done })
      await refresh()
    } catch (err: any) {
      setToast({ tone: 'error', text: err.message })
    }
  }

  function commitCell(row: Record<string, unknown>, column: string, value: CellValue) {
    setEditing(null)
    void mutate((confirmed) => call('tables.update', { ...base, match: matchOf(row), set: { [column]: value }, confirmed }), t('tableEditor.saved'))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 mr-auto">
          <h2 className="text-[16px] font-semibold text-surface-50 truncate">{table.schema}.{table.name}</h2>
          <p className="text-[12.5px] text-surface-500">
            {t('tableEditor.estimated', { count: table.estimatedRows })} · {table.rls ? t('tableEditor.rlsOn') : t('tableEditor.rlsOff')}
          </p>
        </div>
        <button className="btn-secondary !py-1" onClick={() => query.refetch()}>
          <RefreshCw size={13} className={query.isFetching ? 'animate-spin' : ''} />
          {t('tableEditor.refresh')}
        </button>
        {editable && (
          <button className="btn-primary !py-1" onClick={() => setInserting(true)}>
            <Plus size={13} />
            {t('tableEditor.insert')}
          </button>
        )}
      </div>

      {/* Filter */}
      {columns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !w-40" value={draftFilter.column || columns[0].name} onChange={(e) => setDraftFilter({ ...draftFilter, column: e.target.value })} aria-label={t('tableEditor.filterColumn')}>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select className="input !w-36" value={draftFilter.op} onChange={(e) => setDraftFilter({ ...draftFilter, op: e.target.value as FilterOp })}>
            {OPS.map((op) => (
              <option key={op} value={op}>{t(`tableEditor.ops.${op}` as never)}</option>
            ))}
          </select>
          {draftFilter.op !== 'isnull' && draftFilter.op !== 'notnull' && (
            <input
              className="input !w-48"
              placeholder={t('tableEditor.filterValue')}
              value={draftFilter.value ?? ''}
              onChange={(e) => setDraftFilter({ ...draftFilter, value: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && (setFilter({ ...draftFilter, column: draftFilter.column || columns[0].name }), setPage(0))}
            />
          )}
          <button className="btn-secondary" onClick={() => { setFilter({ ...draftFilter, column: draftFilter.column || columns[0].name }); setPage(0) }}>
            {t('tableEditor.applyFilter')}
          </button>
          {filter && (
            <button className="btn-ghost" onClick={() => { setFilter(undefined); setPage(0) }}>
              {t('tableEditor.clearFilter')}
            </button>
          )}
        </div>
      )}

      {toast && <Notice tone={toast.tone}>{toast.text}</Notice>}
      {query.error && <Notice tone="error">{query.error.message}</Notice>}
      {!editable && columns.length > 0 && (
        <Notice tone="info">{table.kind !== 'table' ? t('tableEditor.readOnlyView') : t('tableEditor.noPrimaryKey')}</Notice>
      )}

      {query.isLoading ? (
        <CenteredSpinner />
      ) : (
        <>
          <div className="overflow-auto rounded-xl border border-surface-700/70 bg-surface-900 max-h-[calc(100vh-290px)]">
            <table className="w-full text-[12.5px] border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr>
                  {columns.map((c) => (
                    <th key={c.name} className="text-left bg-surface-800 border-b border-surface-700 p-0">
                      <button
                        className="w-full flex items-center gap-1 px-3 py-2 font-semibold text-surface-300 whitespace-nowrap hover:text-surface-50"
                        onClick={() => {
                          if (orderBy === c.name) setDescending(!descending)
                          else { setOrderBy(c.name); setDescending(false) }
                          setPage(0)
                        }}
                        title={`${c.type}${c.primaryKey ? ` · ${t('tableEditor.pk')}` : ''}${c.generated ? ` · ${t('tableEditor.generated')}` : ''}`}
                      >
                        {c.primaryKey && <span className="text-brand-400">●</span>}
                        {c.name}
                        <span className="font-normal text-surface-500">{c.type.replace('timestamp with time zone', 'timestamptz')}</span>
                        {orderBy === c.name && (descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                      </button>
                    </th>
                  ))}
                  {editable && <th className="bg-surface-800 border-b border-surface-700 w-10" />}
                </tr>
              </thead>
              <tbody>
                {(query.data?.rows ?? []).map((row, ri) => (
                  <tr key={ri} className="group hover:bg-surface-800/40">
                    {columns.map((c) => {
                      const isEditing = editing?.row === ri && editing.column === c.name
                      return (
                        <td
                          key={c.name}
                          className="px-3 py-1.5 border-b border-surface-700/40 font-mono max-w-[320px] align-top"
                          onDoubleClick={() => editable && !c.generated && setEditing({ row: ri, column: c.name })}
                          title={cellText(row[c.name])}
                        >
                          {isEditing ? (
                            <CellEditor
                              column={c}
                              initial={row[c.name]}
                              onCancel={() => setEditing(null)}
                              onCommit={(value) => commitCell(row, c.name, value)}
                            />
                          ) : row[c.name] === null || row[c.name] === undefined ? (
                            <span className="text-surface-500 italic">null</span>
                          ) : typeof row[c.name] === 'number' || typeof row[c.name] === 'boolean' ? (
                            <span className="text-brand-400">{cellText(row[c.name])}</span>
                          ) : (
                            <span className="block truncate">{cellText(row[c.name])}</span>
                          )}
                        </td>
                      )
                    })}
                    {editable && (
                      <td className="border-b border-surface-700/40 text-center">
                        <button
                          className="p-1 rounded text-surface-600 group-hover:text-surface-400 hover:!text-red-400"
                          title={t('tableEditor.deleteRow')}
                          onClick={() => setDeleting(row)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {(query.data?.rows.length ?? 0) === 0 && (
              <p className="px-4 py-6 text-[13px] text-surface-500">{filter ? t('tableEditor.noRowsFiltered') : t('tableEditor.noRows')}</p>
            )}
          </div>

          <div className="flex items-center justify-between text-[12.5px] text-surface-400">
            <span>{editable ? t('tableEditor.editHint') : ''}</span>
            <div className="flex items-center gap-2">
              <span>{t('tableEditor.pageOf', { from: page * PAGE_SIZE + 1, to: page * PAGE_SIZE + (query.data?.rows.length ?? 0) })}</span>
              <button className="btn-secondary !py-1" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={t('common.previous')}>
                <ChevronLeft size={14} />
              </button>
              <button className="btn-secondary !py-1" disabled={!query.data?.hasMore} onClick={() => setPage(page + 1)} aria-label={t('common.next')}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      <InsertSheet
        open={inserting}
        columns={columns}
        tableName={`${table.schema}.${table.name}`}
        onClose={() => setInserting(false)}
        onInsert={(values) => {
          setInserting(false)
          void mutate((confirmed) => call('tables.insert', { ...base, values, confirmed }), t('tableEditor.inserted'))
        }}
      />

      {deleting && (
        <ConfirmSheet
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={t('tableEditor.deleteTitle')}
          description={t('tableEditor.deleteBody', { table: `${table.schema}.${table.name}` })}
          actionLabel={t('common.delete')}
          onConfirm={async () => {
            const row = deleting
            setDeleting(null)
            await mutate((confirmed) => call('tables.delete', { ...base, match: matchOf(row), confirmed }), t('tableEditor.deleted'))
          }}
        />
      )}

      {pending && (
        <ConfirmSheet
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={t('tableEditor.confirmTitle', { name: project.name })}
          description={
            <div>
              <p>{t('tableEditor.confirmBody')}</p>
              <ul className="list-disc pl-5 mt-1">
                {pending.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          }
          actionLabel={t('tableEditor.confirmAction')}
          tone="primary"
          onConfirm={async () => {
            const run = pending.run
            setPending(null)
            try {
              await run()
            } catch (err: any) {
              setToast({ tone: 'error', text: err.message })
            }
          }}
        />
      )}
    </div>
  )
}

function CellEditor({
  column,
  initial,
  onCommit,
  onCancel,
}: {
  column: ColumnInfo
  initial: unknown
  onCommit: (value: CellValue) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(initial === null || initial === undefined ? '' : cellText(initial))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.select(), [])

  return (
    <div className="flex items-center gap-1">
      <input
        ref={ref}
        className="input !py-0.5 !px-2 font-mono text-[12.5px] min-w-[140px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit({ kind: 'text', value: text })
          if (e.key === 'Escape') onCancel()
        }}
        aria-label={column.name}
      />
      {column.nullable && (
        <button className="text-[11px] text-surface-400 hover:text-surface-100 whitespace-nowrap" onClick={() => onCommit({ kind: 'null' })}>
          {t('tableEditor.setNull')}
        </button>
      )}
    </div>
  )
}

type InsertMode = 'default' | 'null' | 'value'

function InsertSheet({
  open,
  columns,
  tableName,
  onClose,
  onInsert,
}: {
  open: boolean
  columns: ColumnInfo[]
  tableName: string
  onClose: () => void
  onInsert: (values: Record<string, CellValue>) => void
}) {
  const { t } = useTranslation()
  const fields = columns.filter((c) => !c.generated)
  const [state, setState] = useState<Record<string, { mode: InsertMode; value: string }>>({})

  useEffect(() => {
    if (open) {
      setState(Object.fromEntries(fields.map((c) => [c.name, { mode: c.default || c.identity || c.nullable ? 'default' : 'value', value: '' }])))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function submit() {
    const values: Record<string, CellValue> = {}
    for (const c of fields) {
      const s = state[c.name]
      if (!s) continue
      if (s.mode === 'null') values[c.name] = { kind: 'null' }
      else if (s.mode === 'value') values[c.name] = { kind: 'text', value: s.value }
      // 'default' columns are simply left out so the database fills them in
    }
    onInsert(values)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('tableEditor.insertTitle', { table: tableName })}
      description={t('tableEditor.insertBody')}
      width={560}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={submit}>{t('tableEditor.insertAction')}</button>
        </>
      }
    >
      <div className="space-y-3">
        {fields.map((c) => {
          const s = state[c.name] ?? { mode: 'default' as InsertMode, value: '' }
          const modes: InsertMode[] = ['value', ...(c.nullable ? (['null'] as InsertMode[]) : []), ...(c.default || c.identity || c.nullable ? (['default'] as InsertMode[]) : [])]
          return (
            <div key={c.name}>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">
                  {c.name} <span className="font-normal text-surface-500">{c.type}</span>
                </label>
                <div className="segmented !p-0.5">
                  {modes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="segmented-item !px-2 !py-0.5 !text-[11.5px]"
                      aria-selected={s.mode === m}
                      onClick={() => setState({ ...state, [c.name]: { ...s, mode: m } })}
                    >
                      {t(m === 'value' ? 'tableEditor.useValue' : m === 'null' ? 'tableEditor.useNull' : 'tableEditor.useDefault')}
                    </button>
                  ))}
                </div>
              </div>
              <input
                className="input font-mono text-[13px]"
                disabled={s.mode !== 'value'}
                value={s.mode === 'value' ? s.value : ''}
                placeholder={s.mode === 'default' ? (c.default ?? 'default') : s.mode === 'null' ? 'NULL' : ''}
                onChange={(e) => setState({ ...state, [c.name]: { ...s, value: e.target.value } })}
              />
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}
