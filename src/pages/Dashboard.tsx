import { useState, useEffect } from 'react'
import {
  Database,
  HardDrive,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Calendar,
  TrendingUp,
  FolderOpen,
} from 'lucide-react'
import { BackupHistoryTable } from '../components/BackupHistoryTable'
import { StatusBadge } from '../components/StatusBadge'
import { useNavigate } from 'react-router-dom'

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

interface ConnectionSchedulerStatus {
  connectionId: string
  connectionName: string
  running: boolean
  cron: string
  nextRun: string | null
  lastRun: string | null
}

interface SchedulerStatus {
  activeCount: number
  connections: ConnectionSchedulerStatus[]
}

export function Dashboard() {
  const navigate = useNavigate()
  const [history, setHistory] = useState<BackupRecord[]>([])
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null)
  const [localBackupPath, setLocalBackupPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [historyData, schedulerData, cfg] = await Promise.all([
        window.electronAPI.getBackupHistory(),
        window.electronAPI.getSchedulerStatus(),
        window.electronAPI.getConfig(),
      ])
      setHistory(historyData)
      setScheduler(schedulerData as SchedulerStatus)
      const local = (cfg as any).destinations?.local
      if (local?.enabled && local?.path) setLocalBackupPath(local.path)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    await window.electronAPI.deleteBackupRecord(id)
    setHistory((prev) => prev.filter((r) => r.id !== id))
  }

  const totalBackups  = history.length
  const successCount  = history.filter((r) => r.status === 'success').length
  const failedCount   = history.filter((r) => r.status === 'failed').length
  const totalSize     = history.reduce((acc, r) => acc + r.size, 0)
  const lastBackup    = history[0]

  // Next upcoming run across all scheduled connections
  const nextScheduled = scheduler?.connections
    .filter((c) => c.nextRun)
    .sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime())[0] ?? null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-50">Dashboard</h1>
          <p className="text-surface-400 mt-1">Overview of your Supabase backups</p>
        </div>
        <div className="flex items-center gap-3">
          {localBackupPath && (
            <button
              onClick={() => window.electronAPI.openFolder(localBackupPath)}
              className="btn-secondary flex items-center gap-2"
            >
              <FolderOpen size={16} />
              Open Backup Folder
            </button>
          )}
          <button onClick={() => navigate('/backup')} className="btn-primary flex items-center gap-2">
            <PlayCircle size={18} />
            Run Backup
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Database size={20} className="text-brand-400" />}
          label="Total Backups" value={totalBackups.toString()} bgColor="bg-brand-500/10" />
        <StatCard icon={<CheckCircle2 size={20} className="text-emerald-400" />}
          label="Successful" value={successCount.toString()} bgColor="bg-emerald-500/10" />
        <StatCard icon={<XCircle size={20} className="text-red-400" />}
          label="Failed" value={failedCount.toString()} bgColor="bg-red-500/10" />
        <StatCard icon={<HardDrive size={20} className="text-blue-400" />}
          label="Total Size" value={formatBytes(totalSize)} bgColor="bg-blue-500/10" />
      </div>

      {/* Last backup + Scheduler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Last backup */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-surface-400" />
            <h3 className="font-medium text-surface-200">Last Backup</h3>
          </div>
          {lastBackup ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-400">Status</span>
                <StatusBadge status={lastBackup.status} />
              </div>
              {lastBackup.connectionName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-400">Connection</span>
                  <span className="text-sm text-surface-200">{lastBackup.connectionName}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-400">Time</span>
                <span className="text-sm text-surface-200">
                  {new Date(lastBackup.timestamp).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-400">Size</span>
                <span className="text-sm font-mono text-surface-200">{formatBytes(lastBackup.size)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-400">Duration</span>
                <span className="text-sm text-surface-200">{formatDuration(lastBackup.duration)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-surface-500">No backups yet</p>
          )}
        </div>

        {/* Scheduler */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-surface-400" />
            <h3 className="font-medium text-surface-200">Scheduled Backups</h3>
          </div>

          {scheduler && scheduler.activeCount > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-400">Active schedules</span>
                <span className="text-sm font-semibold text-emerald-400">{scheduler.activeCount}</span>
              </div>
              {nextScheduled && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-400">Next run</span>
                  <div className="text-right">
                    <p className="text-sm text-surface-200">
                      {new Date(nextScheduled.nextRun!).toLocaleString('pt-BR')}
                    </p>
                    <p className="text-xs text-surface-500">{nextScheduled.connectionName}</p>
                  </div>
                </div>
              )}
              <div className="space-y-1.5 pt-1 border-t border-surface-700">
                {scheduler.connections.map((conn) => (
                  <div key={conn.connectionId} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-surface-300">{conn.connectionName}</span>
                    </div>
                    <span className="font-mono text-surface-500">{conn.cron}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-surface-500">No schedules active.</p>
              <p className="text-xs text-surface-600">
                Configure automatic schedules in Settings → Connections.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* History table */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-surface-400" />
          <h3 className="font-medium text-surface-200">Backup History</h3>
        </div>
        <BackupHistoryTable records={history} onDelete={handleDelete} />
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, bgColor }: {
  icon: React.ReactNode; label: string; value: string; bgColor: string
}) {
  return (
    <div className="card-hover flex items-center gap-4">
      <div className={`p-3 rounded-lg ${bgColor}`}>{icon}</div>
      <div>
        <p className="text-sm text-surface-400">{label}</p>
        <p className="text-xl font-bold text-surface-100">{value}</p>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}
