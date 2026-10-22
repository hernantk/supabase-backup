import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { statusTone, type StatusTone } from '../hooks/useProjects'

const DOT: Record<StatusTone, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  busy: 'bg-amber-400 animate-pulse',
  off: 'bg-surface-500',
  bad: 'bg-red-400',
  none: 'bg-transparent',
}

const BADGE: Record<StatusTone, string> = {
  ok: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  busy: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  off: 'bg-surface-500/10 text-surface-400 border-surface-500/20',
  bad: 'bg-red-500/10 text-red-400 border-red-500/20',
  none: '',
}

export function StatusDot({ status, className = '' }: { status?: string; className?: string }) {
  const tone = statusTone(status)
  if (tone === 'none') return null
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT[tone]} ${className}`} aria-hidden />
}

export function ProjectStatusBadge({ status }: { status?: string }) {
  const { t, i18n } = useTranslation()
  const tone = statusTone(status)
  if (tone === 'none' || !status) return null

  const key = `projects.status.${status}`
  const label = i18n.exists(key) ? t(key as never) : t('projects.status.UNKNOWN')
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${BADGE[tone]}`}>
      {tone === 'busy' ? <Loader2 size={11} className="animate-spin" /> : <StatusDot status={status} className="!w-1.5 !h-1.5" />}
      {label}
    </span>
  )
}
