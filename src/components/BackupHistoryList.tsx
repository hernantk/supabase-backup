import { useNavigate } from 'react-router-dom'
import { HardDrive, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatBytes, formatDateTime, formatDuration, formatRelative } from '../lib/format'
import { EmptyState } from './ui'
import type { BackupRecord } from '../../electron/preload'

const STATUS_STYLE: Record<BackupRecord['status'], string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  running: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

export function BackupHistoryList({
  records,
  showProject = true,
  onDelete,
}: {
  records: BackupRecord[]
  showProject?: boolean
  onDelete?: (id: string) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (records.length === 0) {
    return <EmptyState icon={HardDrive} title={t('backups.historyEmpty.title')} body={t('backups.historyEmpty.body')} />
  }

  return (
    <ul className="list-group">
      {records.map((r) => (
        <li key={r.id} className="list-row min-h-[56px]">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 w-[84px] justify-center ${STATUS_STYLE[r.status]}`}
          >
            {t(`backups.state.${r.status === 'success' ? 'succeeded' : r.status === 'failed' ? 'failed' : 'running'}`)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] text-surface-100 truncate">
              {showProject ? (r.connectionName ?? '—') : formatRelative(r.timestamp)}
            </span>
            <span className="block text-[12.5px] text-surface-500 truncate" title={r.error}>
              {r.status === 'failed' && r.error ? r.error : showProject ? formatDateTime(r.timestamp) : formatDateTime(r.timestamp)}
            </span>
          </span>
          <span className="hidden md:flex gap-1 shrink-0">
            {r.type.map((x) => (
              <span key={x} className="px-2 py-0.5 rounded bg-surface-800 text-[11.5px] text-surface-300">{x}</span>
            ))}
          </span>
          <span className="hidden lg:block w-20 text-right text-[12.5px] text-surface-300 font-mono shrink-0">{formatBytes(r.size)}</span>
          <span className="hidden lg:block w-16 text-right text-[12.5px] text-surface-400 shrink-0">{formatDuration(r.duration)}</span>
          <span className="hidden xl:flex gap-1 shrink-0">
            {r.destinations.map((d) => (
              <span key={d} className="px-2 py-0.5 rounded bg-brand-500/10 text-[11.5px] text-brand-400">{d}</span>
            ))}
          </span>
          <span className="flex gap-0.5 shrink-0">
            {r.status === 'success' && r.localPath && (
              <button
                className="p-1.5 rounded text-surface-500 hover:text-surface-100 hover:bg-surface-800"
                title={t('backups.restoreFrom')}
                onClick={() => navigate('/restore', { state: { filePath: r.localPath, connectionId: r.connectionId } })}
              >
                <RotateCcw size={15} />
              </button>
            )}
            {onDelete && (
              <button
                className="p-1.5 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10"
                title={t('backups.deleteRecord')}
                onClick={() => onDelete(r.id)}
              >
                <Trash2 size={15} />
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
