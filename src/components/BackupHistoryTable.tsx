import { StatusBadge } from './StatusBadge'
import { Clock, HardDrive, Trash2 } from 'lucide-react'

interface BackupRecord {
  id: string
  connectionId?: string
  connectionName?: string
  timestamp: string
  duration: number
  size: number
  type: ('database' | 'storage')[]
  destinations: string[]
  status: 'success' | 'failed' | 'running'
  error?: string
}

interface BackupHistoryTableProps {
  records: BackupRecord[]
  onDelete?: (id: string) => void
}

export function BackupHistoryTable({ records, onDelete }: BackupHistoryTableProps) {
  if (records.length === 0) {
    return (
      <div className="card text-center py-12">
        <HardDrive size={48} className="mx-auto text-surface-600 mb-4" />
        <h3 className="text-lg font-medium text-surface-300 mb-2">No backups yet</h3>
        <p className="text-sm text-surface-500">
          Run your first backup to see history here.
        </p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden p-0">
      <table className="w-full">
        <thead>
          <tr className="border-b border-surface-700 bg-surface-800/50">
            <th className="text-left px-4 py-3 text-xs font-medium text-surface-400 uppercase tracking-wider">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-surface-400 uppercase tracking-wider">
              Date
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-surface-400 uppercase tracking-wider">
              Connection
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-surface-400 uppercase tracking-wider">
              Type
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-surface-400 uppercase tracking-wider">
              Size
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-surface-400 uppercase tracking-wider">
              Duration
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-surface-400 uppercase tracking-wider">
              Destinations
            </th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {records.map((record) => (
            <tr
              key={record.id}
              className="hover:bg-surface-800/30 transition-colors"
            >
              <td className="px-4 py-3">
                <StatusBadge status={record.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-surface-200">
                  <Clock size={14} className="text-surface-500" />
                  {formatDate(record.timestamp)}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-surface-300">
                {record.connectionName ?? <span className="text-surface-600">—</span>}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {record.type.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 bg-surface-800 rounded text-xs text-surface-300 font-mono"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-surface-300 font-mono">
                {formatBytes(record.size)}
              </td>
              <td className="px-4 py-3 text-sm text-surface-300">
                {formatDuration(record.duration)}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {record.destinations.map((d) => (
                    <span
                      key={d}
                      className="px-2 py-0.5 bg-brand-500/10 border border-brand-500/20 rounded text-xs text-brand-400"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                {onDelete && (
                  <button
                    onClick={() => onDelete(record.id)}
                    className="p-1.5 rounded hover:bg-red-500/10 transition-colors group"
                    title="Delete record"
                  >
                    <Trash2 size={14} className="text-surface-500 group-hover:text-red-400" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}
