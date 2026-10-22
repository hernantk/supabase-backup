import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, StopCircle } from 'lucide-react'
import { useJobs } from '../contexts/JobsContext'
import { ProgressBar } from './ProgressBar'

const MAX_SHOWN = 3

function truncateText(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

/** Floating summary of the backup queue, shown on every page except the ones that show it in full. */
export function BackupMiniProgress() {
  const navigate = useNavigate()
  const location = useLocation()
  const { jobs, runningCount, queuedCount, activeCount, cancelJob } = useJobs()

  if (activeCount === 0 || location.pathname === '/backup' || location.pathname === '/backups') return null

  const running = jobs.filter((j) => j.state === 'running')
  const shown = running.slice(0, MAX_SHOWN)
  const hidden = running.length - shown.length

  return (
    <div onClick={() => navigate('/backups')} className="fixed bottom-5 right-5 z-50 w-80 cursor-pointer">
      <div className="bg-surface-900 border border-brand-500/30 rounded-xl shadow-2xl p-4 space-y-3 hover:border-brand-500/60 transition-colors">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-brand-400" />
          <span className="text-sm font-medium text-surface-200">
            {runningCount} backup{runningCount === 1 ? '' : 's'} running
            {queuedCount > 0 && <span className="text-surface-500"> · {queuedCount} queued</span>}
          </span>
        </div>

        {shown.map((job) => (
          <div key={job.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-surface-300 truncate">{job.label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); cancelJob(job.id) }}
                className="p-1 rounded hover:bg-red-500/10 text-surface-500 hover:text-red-400 transition-colors"
                title="Cancel backup"
              >
                <StopCircle size={13} />
              </button>
            </div>
            <ProgressBar
              progress={job.progress?.progress ?? 0}
              label={truncateText(job.progress?.message ?? 'Starting...', 42)}
              showPercentage={false}
            />
          </div>
        ))}
        {hidden > 0 && <p className="text-xs text-surface-500">+{hidden} more running</p>}
      </div>
    </div>
  )
}
