import { useEffect, useRef, useState } from 'react'
import { Bookmark, Clock, Copy, Download, Loader2, Lock, Play, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call } from '../../lib/api'
import { classifySql } from '../../../electron/core/sqlClassify'
import { cellText, downloadText, ResultTable, toCsv } from '../../components/ResultTable'
import { ConfirmSheet, EmptyState, Notice, Section, Sheet, Switch } from '../../components/ui'
import { Terminal } from 'lucide-react'
import { Requires, useWorkspaceProject } from './ProjectWorkspace'
import type { SqlKind, SqlRunOutcome, QueryResult } from '../../../electron/shared/managerApi'

interface Snippet {
  name: string
  sql: string
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable: history just won't persist
  }
}

export function SqlEditor() {
  const project = useWorkspaceProject()
  return (
    <Requires need="sql" project={project}>
      <SqlEditorInner />
    </Requires>
  )
}

function SqlEditorInner() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const historyKey = `sql.history.${project.connectionId}`
  const snippetKey = `sql.snippets.${project.connectionId}`

  const [sql, setSql] = useState('')
  const [readOnly, setReadOnly] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ kind: SqlKind; data: QueryResult } | null>(null)
  const [pending, setPending] = useState<{ text: string; reasons: string[]; kind: SqlKind } | null>(null)
  const [history, setHistory] = useState<string[]>(() => readJson(historyKey, []))
  const [snippets, setSnippets] = useState<Snippet[]>(() => readJson(snippetKey, []))
  const [copied, setCopied] = useState(false)
  const [snippetDraft, setSnippetDraft] = useState<{ sql: string; name: string } | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setHistory(readJson(historyKey, []))
    setSnippets(readJson(snippetKey, []))
    setResult(null)
    setError(null)
  }, [historyKey, snippetKey])

  /** The selected text when there is a selection, else the whole editor. */
  function currentText(): string {
    const el = area.current
    if (el && el.selectionStart !== el.selectionEnd) return el.value.slice(el.selectionStart, el.selectionEnd)
    return sql
  }

  async function execute(text: string, confirmed = false) {
    if (!text.trim()) return
    setRunning(true)
    setError(null)
    try {
      const outcome: SqlRunOutcome = await call('sql.run', {
        connectionId: project.connectionId,
        sql: text,
        readOnly,
        confirmed,
      })
      if (outcome.status === 'confirm') {
        setPending({ text, reasons: outcome.reasons, kind: outcome.kind })
        return
      }
      setResult({ kind: outcome.kind, data: outcome.result })
      const next = [text, ...history.filter((h) => h !== text)].slice(0, 25)
      setHistory(next)
      writeJson(historyKey, next)
    } catch (err: any) {
      setResult(null)
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  function run() {
    const text = currentText()
    if (!text.trim()) return
    const { kind, reasons } = classifySql(text)
    // Destructive statements always need the project name, protected or not.
    if (!readOnly && kind === 'destructive') {
      setPending({ text, reasons, kind })
      return
    }
    void execute(text)
  }

  function saveSnippet() {
    const text = currentText().trim()
    if (text) setSnippetDraft({ sql: text, name: text.replace(/\s+/g, ' ').slice(0, 40) })
  }

  function commitSnippet() {
    if (!snippetDraft?.name.trim()) return
    const next = [{ name: snippetDraft.name.trim(), sql: snippetDraft.sql }, ...snippets.filter((s) => s.name !== snippetDraft.name.trim())]
    setSnippets(next)
    writeJson(snippetKey, next)
    setSnippetDraft(null)
  }

  const needsTypedName = pending?.kind === 'destructive'

  return (
    <div className="space-y-6">
      <div className="list-group">
        <label className="list-row cursor-pointer">
          <Lock size={16} className={readOnly ? 'text-brand-400' : 'text-surface-500'} />
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] text-surface-100">{t('sql.readOnly')}</span>
            <span className="block text-[12.5px] text-surface-500">
              {readOnly ? t('sql.readOnlyHint') : project.protected ? t('sql.protectedHint') : t('sql.readOnlyHint')}
            </span>
          </span>
          <Switch label={t('sql.readOnly')} checked={readOnly} onChange={setReadOnly} />
        </label>
      </div>

      <div className="space-y-2">
        <textarea
          ref={area}
          className="input font-mono text-[13px] min-h-[190px] resize-y leading-relaxed"
          spellCheck={false}
          placeholder={t('sql.placeholder')}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              run()
            }
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-surface-500">{t('sql.shortcut')}</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={saveSnippet} disabled={!sql.trim()}>
              <Bookmark size={14} />
              {t('sql.saveSnippet')}
            </button>
            <button className="btn-primary" onClick={run} disabled={running || !sql.trim()}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {running ? t('sql.running') : t('sql.run')}
            </button>
          </div>
        </div>
      </div>

      {error && <Notice tone="error"><pre className="whitespace-pre-wrap font-mono text-[12.5px]">{error}</pre></Notice>}

      {result ? (
        <Section
          title={t('sql.result')}
          action={
            <div className="flex items-center gap-1 text-[12.5px]">
              <span className="text-surface-500 mr-2">
                {t('sql.kind.' + result.kind as never)} ·{' '}
                {t('sql.rowsIn', { rows: t('common.rows', { count: result.data.rowCount }), ms: result.data.durationMs })}
              </span>
              {result.data.rows.length > 0 && (
                <>
                  <button
                    className="btn-ghost !px-2 !py-1"
                    onClick={() => downloadText(`${project.name}-result.csv`, toCsv(result.data), 'text/csv')}
                  >
                    <Download size={13} />
                    {t('sql.exportCsv')}
                  </button>
                  <button
                    className="btn-ghost !px-2 !py-1"
                    onClick={() => downloadText(`${project.name}-result.json`, JSON.stringify(result.data.rows, null, 2), 'application/json')}
                  >
                    <Download size={13} />
                    {t('sql.exportJson')}
                  </button>
                  <button
                    className="btn-ghost !px-2 !py-1"
                    onClick={async () => {
                      await navigator.clipboard.writeText(JSON.stringify(result.data.rows, null, 2))
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    }}
                  >
                    <Copy size={13} />
                    {copied ? t('common.copied') : t('sql.copyJson')}
                  </button>
                </>
              )}
            </div>
          }
          footer={result.data.truncated ? t('sql.truncated', { shown: result.data.rows.length, total: result.data.rowCount }) : undefined}
        >
          {result.data.columns.length === 0 && result.data.rows.length === 0 ? (
            <div className="list-group px-4 py-4 text-[13.5px] text-surface-400">{t('sql.noRows')}</div>
          ) : (
            <ResultTable columns={result.data.columns} rows={result.data.rows} />
          )}
        </Section>
      ) : (
        !error && <EmptyState icon={Terminal} title={t('sql.empty.title')} body={t('sql.empty.body')} />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Section
          title={t('sql.history')}
          action={
            history.length > 0 && (
              <button
                className="text-[12.5px] text-surface-500 hover:text-surface-300"
                onClick={() => {
                  setHistory([])
                  writeJson(historyKey, [])
                }}
              >
                {t('sql.clearHistory')}
              </button>
            )
          }
        >
          <ul className="list-group max-h-64 overflow-y-auto">
            {history.length === 0 && <li className="list-row text-[13px] text-surface-500">{t('sql.noHistory')}</li>}
            {history.map((h) => (
              <li key={h}>
                <button className="list-row w-full text-left hover:bg-surface-800/50 !min-h-[40px]" onClick={() => setSql(h)}>
                  <Clock size={13} className="text-surface-500 shrink-0" />
                  <span className="font-mono text-[12.5px] truncate text-surface-200">{h.replace(/\s+/g, ' ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('sql.snippets')}>
          <ul className="list-group max-h-64 overflow-y-auto">
            {snippets.length === 0 && <li className="list-row text-[13px] text-surface-500">{t('sql.noSnippets')}</li>}
            {snippets.map((s) => (
              <li key={s.name} className="flex items-center">
                <button className="list-row flex-1 min-w-0 text-left hover:bg-surface-800/50 !min-h-[40px]" onClick={() => setSql(s.sql)}>
                  <Bookmark size={13} className="text-brand-400 shrink-0" />
                  <span className="truncate text-[13px] text-surface-100">{s.name}</span>
                </button>
                <button
                  className="px-3 text-surface-500 hover:text-red-400"
                  aria-label={t('common.delete')}
                  onClick={() => {
                    const next = snippets.filter((x) => x.name !== s.name)
                    setSnippets(next)
                    writeJson(snippetKey, next)
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Sheet
        open={!!snippetDraft}
        onOpenChange={(o) => !o && setSnippetDraft(null)}
        title={t('sql.saveSnippet')}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSnippetDraft(null)}>{t('common.cancel')}</button>
            <button className="btn-primary" disabled={!snippetDraft?.name.trim()} onClick={commitSnippet}>{t('common.save')}</button>
          </>
        }
      >
        <label className="label">{t('sql.snippetName')}</label>
        <input
          className="input"
          autoFocus
          value={snippetDraft?.name ?? ''}
          onChange={(e) => setSnippetDraft(snippetDraft && { ...snippetDraft, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && commitSnippet()}
        />
      </Sheet>

      <ConfirmSheet
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={t('sql.confirm.title', { name: project.name })}
        description={
          pending && (
            <div className="space-y-2">
              <p>{needsTypedName ? t('sql.confirm.destructiveBody') : t('sql.confirm.protectedBody')}</p>
              <ul className="list-disc pl-5">
                {pending.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-surface-950 p-3 font-mono text-[12px] text-surface-200 whitespace-pre-wrap">{pending.text}</pre>
            </div>
          )
        }
        actionLabel={t('sql.confirm.action')}
        confirmText={needsTypedName ? project.name : undefined}
        onConfirm={async () => {
          const text = pending!.text
          setPending(null)
          await execute(text, true)
        }}
      />
    </div>
  )
}
