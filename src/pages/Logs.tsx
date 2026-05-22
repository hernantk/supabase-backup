import { useState, useEffect } from 'react'
import { ScrollText, RefreshCw, Filter } from 'lucide-react'

interface LogEntry {
  timestamp: string
  level: string
  message: string
  meta?: Record<string, any>
}

const levelColors: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-surface-500',
}

export function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')

  useEffect(() => {
    loadLogs()
  }, [filter])

  async function loadLogs() {
    setLoading(true)
    try {
      const data = await window.electronAPI.getLogs({
        limit: 200,
        offset: 0,
        level: filter || undefined,
      })
      setLogs(data)
    } catch (err) {
      console.error('Failed to load logs:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-50">Logs</h1>
          <p className="text-surface-400 mt-1">Application logs and backup history</p>
        </div>
        <button onClick={loadLogs} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter size={16} className="text-surface-500" />
        <div className="flex gap-2">
          {['', 'info', 'warn', 'error'].map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filter === level
                  ? 'bg-brand-500/10 text-brand-400 border border-brand-500/30'
                  : 'bg-surface-800 text-surface-400 border border-surface-700 hover:border-surface-600'
              }`}
            >
              {level || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Log Entries */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <ScrollText size={48} className="mx-auto text-surface-600 mb-4" />
            <h3 className="text-lg font-medium text-surface-300 mb-2">No logs yet</h3>
            <p className="text-sm text-surface-500">
              Logs will appear here after your first backup.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-800 max-h-[600px] overflow-y-auto">
            {logs.map((log, index) => (
              <div
                key={index}
                className="px-4 py-3 hover:bg-surface-800/30 transition-colors font-mono text-xs"
              >
                <div className="flex items-start gap-3">
                  <span className="text-surface-600 shrink-0 w-36">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span
                    className={`uppercase font-bold shrink-0 w-12 ${
                      levelColors[log.level] || 'text-surface-400'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-surface-200 break-all">{log.message}</span>
                </div>
                {log.meta && Object.keys(log.meta).length > 0 && (
                  <div className="ml-[12rem] mt-1 text-surface-500">
                    {JSON.stringify(log.meta)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
