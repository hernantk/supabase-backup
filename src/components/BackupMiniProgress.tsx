import { useNavigate, useLocation } from 'react-router-dom'
import { useBackup } from '../contexts/BackupContext'
import { ProgressBar } from './ProgressBar'
import {
  Loader2,
  Database,
  FolderOpen,
  Package,
  Lock,
  Cloud,
  StopCircle,
} from 'lucide-react'

function truncateText(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

const STAGE_ICONS: Record<string, React.ReactNode> = {
  database: <Database size={16} />,
  storage:  <FolderOpen size={16} />,
  compress: <Package size={16} />,
  encrypt:  <Lock size={16} />,
  upload:   <Cloud size={16} />,
}

export function BackupMiniProgress() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isRunning, progress, cancelBackup } = useBackup()

  if (!isRunning || location.pathname === '/backup') return null

  const icon = progress?.stage ? STAGE_ICONS[progress.stage] : <Loader2 size={16} className="animate-spin" />

  return (
    <div
      onClick={() => navigate('/backup')}
      className="fixed bottom-5 right-5 z-50 w-72 cursor-pointer"
    >
      <div className="bg-surface-900 border border-brand-500/30 rounded-xl shadow-2xl p-4 space-y-2 hover:border-brand-500/60 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-brand-500/15 flex items-center justify-center text-brand-400">
              {icon}
            </div>
            <span className="text-sm font-medium text-surface-200">Backup running</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); cancelBackup() }}
            className="p-1 rounded hover:bg-red-500/10 text-surface-500 hover:text-red-400 transition-colors"
            title="Cancel backup"
          >
            <StopCircle size={14} />
          </button>
        </div>

        {/* Progress bar */}
        <ProgressBar
          progress={progress?.progress ?? 0}
          label={truncateText(progress?.message ?? 'Starting...', 45)}
          showPercentage={true}
        />
      </div>
    </div>
  )
}
