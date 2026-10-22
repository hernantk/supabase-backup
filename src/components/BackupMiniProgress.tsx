import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2, StopCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useJobs } from '../contexts/JobsContext'
import { ProgressBar } from './ProgressBar'

const MAX_SHOWN = 3

/** Floating summary of the backup queue, shown on every page except the queue itself. */
export function BackupMiniProgress() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { jobs, runningCount, queuedCount, activeCount, cancelJob } = useJobs()

  if (activeCount === 0 || location.pathname === '/backups') return null

  const running = jobs.filter((j) => j.state === 'running')
  const shown = running.slice(0, MAX_SHOWN)
  const hidden = running.length - shown.length

  return (
    <div onClick={() => navigate('/backups')} className="fixed bottom-5 right-5 z-40 w-80 cursor-pointer">
      <div className="bg-surface-900 border border-surface-700/70 rounded-2xl shadow-float p-4 space-y-3 hover:border-brand-500/50 transition-colors">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-brand-400" />
          <span className="text-[13.5px] font-medium text-surface-100">
            {t('miniProgress.running', { count: runningCount })}
            {queuedCount > 0 && <span className="text-surface-500"> · {t('miniProgress.queued', { count: queuedCount })}</span>}
          </span>
        </div>

        {shown.map((job) => (
          <div key={job.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-surface-300 truncate">{job.label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  cancelJob(job.id)
                }}
                className="p-1 rounded hover:bg-red-500/10 text-surface-500 hover:text-red-400 transition-colors"
                title={t('common.cancel')}
              >
                <StopCircle size={13} />
              </button>
            </div>
            <ProgressBar progress={job.progress?.progress ?? 0} label={(job.progress?.message ?? t('backups.stage.starting')).slice(0, 42)} showPercentage={false} />
          </div>
        ))}
        {hidden > 0 && <p className="text-[12px] text-surface-500">{t('miniProgress.more', { count: hidden })}</p>}
      </div>
    </div>
  )
}
