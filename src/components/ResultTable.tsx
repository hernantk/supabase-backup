import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { QueryResult } from '../../electron/shared/managerApi'

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function toCsv(result: Pick<QueryResult, 'columns' | 'rows'>): string {
  const escape = (v: unknown) => {
    const s = cellText(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [result.columns.map(escape).join(',')]
  for (const row of result.rows) lines.push(result.columns.map((c) => escape(row[c])).join(','))
  return lines.join('\n')
}

/** Starts a file download (Electron shows the save dialog). */
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Read-only grid with a sticky header; wide cells are truncated and fully visible on hover. */
export function ResultTable({ columns, rows, maxHeight = 460 }: { columns: string[]; rows: Record<string, unknown>[]; maxHeight?: number }) {
  const { t } = useTranslation()
  const cols = useMemo(() => columns, [columns])

  return (
    <div className="overflow-auto rounded-xl border border-surface-700/70 bg-surface-900" style={{ maxHeight }}>
      <table className="w-full text-[12.5px] border-separate border-spacing-0">
        <thead className="sticky top-0 z-10">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="text-left font-semibold text-surface-300 bg-surface-800 px-3 py-2 border-b border-surface-700 whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-800/50">
              {cols.map((c) => {
                const v = row[c]
                const text = cellText(v)
                return (
                  <td key={c} className="px-3 py-1.5 border-b border-surface-700/40 font-mono max-w-[360px] truncate align-top" title={text}>
                    {v === null || v === undefined ? (
                      <span className="text-surface-500 italic">{t('sql.nullValue')}</span>
                    ) : typeof v === 'number' || typeof v === 'boolean' ? (
                      <span className="text-brand-400">{text}</span>
                    ) : (
                      text
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
