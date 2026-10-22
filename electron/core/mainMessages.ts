/**
 * Strings shown by the main process itself (tray, dialogs, notifications). The renderer has its own
 * i18next setup; these few messages live here so the main process needs no UI framework.
 */
export type MainLanguage = 'en' | 'pt-BR'

const MESSAGES = {
  en: {
    'tray.open': 'Open Supabase Backup',
    'tray.backupAll': 'Back up all projects now',
    'tray.quit': 'Quit',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} running{queued}',
    'tray.queuedSuffix': ', {queued} queued',
    'quit.keep': 'Keep running',
    'quit.cancelAndQuit': 'Cancel backups and quit',
    'quit.message.one': '{count} backup is still running or queued.',
    'quit.message.other': '{count} backups are still running or queued.',
    'quit.detail': 'Quitting now cancels them. Schedules only run while the app is running.',
    'notify.backupOk': 'Backup completed',
    'notify.backupOkBody': '{name} · {size} in {duration}',
    'notify.backupFailed': 'Backup failed',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'All {total} backups completed',
    'notify.batchMixed': '{ok} of {total} backups completed',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…and {count} more',
    'notify.batchCancelled': '{count} cancelled',
  },
  'pt-BR': {
    'tray.open': 'Abrir Supabase Backup',
    'tray.backupAll': 'Fazer backup de todos os projetos agora',
    'tray.quit': 'Sair',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} em execução{queued}',
    'tray.queuedSuffix': ', {queued} na fila',
    'quit.keep': 'Continuar rodando',
    'quit.cancelAndQuit': 'Cancelar backups e sair',
    'quit.message.one': '{count} backup ainda está em execução ou na fila.',
    'quit.message.other': '{count} backups ainda estão em execução ou na fila.',
    'quit.detail': 'Sair agora cancela os backups. Os agendamentos só rodam enquanto o app está aberto.',
    'notify.backupOk': 'Backup concluído',
    'notify.backupOkBody': '{name} · {size} em {duration}',
    'notify.backupFailed': 'Backup falhou',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'Os {total} backups foram concluídos',
    'notify.batchMixed': '{ok} de {total} backups concluídos',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…e mais {count}',
    'notify.batchCancelled': '{count} cancelados',
  },
} as const

export type MainMessageKey = keyof (typeof MESSAGES)['en']

export function translate(lang: MainLanguage, key: MainMessageKey, vars: Record<string, string | number> = {}): string {
  const template: string = MESSAGES[lang][key] ?? MESSAGES.en[key]
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`))
}

/** "system" follows the OS locale: Portuguese gets pt-BR, everything else English. */
export function resolveMainLanguage(preference: 'system' | MainLanguage, osLocale: string): MainLanguage {
  if (preference !== 'system') return preference
  return osLocale.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

// ─── Backup notification text ────────────────────────────────────────────────

export interface BatchOutcome {
  total: number
  succeeded: number
  failed: number
  cancelled: number
  failures: { name: string; error: string }[]
}

const MAX_FAILURE_LINES = 5

export function batchNotificationText(lang: MainLanguage, outcome: BatchOutcome): { title: string; body: string; ok: boolean } {
  const ok = outcome.failed === 0 && outcome.cancelled === 0
  const title = ok
    ? translate(lang, 'notify.batchOk', { total: outcome.total })
    : translate(lang, 'notify.batchMixed', { ok: outcome.succeeded, total: outcome.total })

  const lines = outcome.failures
    .slice(0, MAX_FAILURE_LINES)
    .map((f) => translate(lang, 'notify.batchFailedLine', { name: f.name, error: f.error.slice(0, 120) }))
  if (outcome.failures.length > MAX_FAILURE_LINES) {
    lines.push(translate(lang, 'notify.batchMore', { count: outcome.failures.length - MAX_FAILURE_LINES }))
  }
  if (outcome.cancelled > 0) lines.push(translate(lang, 'notify.batchCancelled', { count: outcome.cancelled }))
  return { title, body: lines.join('\n'), ok }
}
