import i18n from '../i18n'

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** i
  return `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(value)} ${units[i]}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export function formatDateTime(iso: string | Date, options: Intl.DateTimeFormatOptions = {}): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  return date.toLocaleString(i18n.language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  })
}

/** "3 minutes ago" / "há 3 minutos", falling back to the date for anything older than a week. */
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return rtf.format(0, 'minute')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  const days = Math.round(hours / 24)
  return days <= 7 ? rtf.format(-days, 'day') : formatDateTime(iso, { hour: undefined, minute: undefined })
}
