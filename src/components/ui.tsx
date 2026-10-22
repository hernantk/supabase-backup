import { useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// ─── Page structure ───────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  )
}

export function Section({
  title,
  action,
  footer,
  children,
}: {
  title?: string
  action?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      {(title || action) && (
        <div className="flex items-center justify-between px-1 mb-2 min-h-[20px]">
          {title ? <h2 className="section-title !mb-0">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
      {footer && <p className="px-1 mt-2 text-[12.5px] text-surface-500">{footer}</p>}
    </section>
  )
}

/** A label/value pair inside a `.list-group`. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="list-row justify-between">
      <span className="text-[13.5px] text-surface-400">{label}</span>
      <span className="text-[13.5px] text-surface-100 text-right min-w-0 truncate">{children}</span>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon
  title: string
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="list-group">
      <div className="flex flex-col items-start gap-1 px-6 py-8">
        <Icon size={22} className="text-surface-500 mb-2" strokeWidth={1.75} />
        <p className="text-[15px] font-semibold text-surface-100">{title}</p>
        {body && <p className="text-[13.5px] text-surface-400 max-w-[60ch]">{body}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-brand-400 ${className}`} size={18} />
}

export function CenteredSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner />
    </div>
  )
}

const NOTICE_STYLES = {
  error: { icon: XCircle, box: 'border-red-500/30 bg-red-500/10 text-red-300' },
  warning: { icon: AlertTriangle, box: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  info: { icon: Info, box: 'border-blue-500/25 bg-blue-500/10 text-blue-300' },
  success: { icon: CheckCircle2, box: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
} as const

export function Notice({
  tone = 'info',
  children,
  action,
}: {
  tone?: keyof typeof NOTICE_STYLES
  children: ReactNode
  action?: ReactNode
}) {
  const { icon: Icon, box } = NOTICE_STYLES[tone]
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13.5px] ${box}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 break-words">{children}</div>
      {action}
    </div>
  )
}

// ─── Controls ─────────────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-selected={value === o.value}
          className="segmented-item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      className="switch"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}

// ─── Sheets ───────────────────────────────────────────────────────────────────

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 460,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="sheet-content fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[85vh] flex flex-col rounded-2xl bg-surface-900 shadow-float border border-surface-700/70"
          style={{ width: `min(92vw, ${width}px)` }}
        >
          <div className="px-6 pt-5 pb-3">
            <Dialog.Title className="text-[17px] font-semibold text-surface-50">{title}</Dialog.Title>
            {description && (
              <Dialog.Description asChild>
                <div className="mt-1.5 text-[13.5px] text-surface-400">{description}</div>
              </Dialog.Description>
            )}
          </div>
          {children && <div className="px-6 pb-4 overflow-y-auto">{children}</div>}
          {footer && <div className="px-6 py-4 border-t border-surface-700/70 flex justify-end gap-2.5">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * Confirmation for destructive actions. When `confirmText` is given the user has to type it
 * (usually the resource name) before the action unlocks.
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  confirmText,
  tone = 'danger',
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  actionLabel: string
  confirmText?: string
  tone?: 'danger' | 'primary'
  onConfirm: () => Promise<unknown> | void
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = !!confirmText && typed.trim() !== confirmText

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
      setTyped('')
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          onOpenChange(next)
          if (!next) {
            setTyped('')
            setError(null)
          }
        }
      }}
      title={title}
      description={description}
      footer={
        <>
          <button className="btn-secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </button>
          <button className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} disabled={locked || busy} onClick={run}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {actionLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {confirmText && (
          <div>
            <label className="label">
              {t('common.typeToConfirm', { text: confirmText })}
            </label>
            <input
              className="input font-mono"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmText}
            />
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Sheet>
  )
}
