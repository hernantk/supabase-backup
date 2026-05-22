interface StatusBadgeProps {
  status: 'success' | 'failed' | 'running' | 'pending'
}

const statusStyles = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  running: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse',
  pending: 'bg-surface-500/10 text-surface-400 border-surface-500/20',
}

const statusLabels = {
  success: 'Success',
  failed: 'Failed',
  running: 'Running',
  pending: 'Pending',
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyles[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'success'
            ? 'bg-emerald-400'
            : status === 'failed'
            ? 'bg-red-400'
            : status === 'running'
            ? 'bg-blue-400'
            : 'bg-surface-400'
        }`}
      />
      {statusLabels[status]}
    </span>
  )
}
