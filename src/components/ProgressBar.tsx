interface ProgressBarProps {
  progress: number
  label?: string
  showPercentage?: boolean
  variant?: 'default' | 'success' | 'error'
}

const variants = {
  default: 'bg-brand-500',
  success: 'bg-emerald-500',
  error: 'bg-red-500',
}

export function ProgressBar({
  progress,
  label,
  showPercentage = true,
  variant = 'default',
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress))

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-2">
          {label && <span className="text-sm text-surface-300">{label}</span>}
          {showPercentage && (
            <span className="text-sm font-mono text-surface-400">{Math.round(clampedProgress)}%</span>
          )}
        </div>
      )}
      <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${variants[variant]}`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  )
}
