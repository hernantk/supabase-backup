/**
 * Strings shown by the main process itself (tray, dialogs, notifications). The renderer has its own
 * i18next setup; these few messages live here so the main process needs no UI framework.
 */
import { resolveLanguagePreference, type Language, type LanguagePreference } from '../shared/languages'

export type MainLanguage = Language

const EN = {
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
}

export type MainMessageKey = keyof typeof EN

/** Messages that vary with a count: `<base>.one` and `<base>.other`, plus `.few`/`.many` where the language has them. */
type PluralBase = 'quit.message'
type FewMany = `${PluralBase}.few` | `${PluralBase}.many`

type Messages = Record<MainMessageKey, string> & Partial<Record<FewMany, string>>

const MESSAGES: Record<Language, Messages> = {
  en: EN,
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
  'pt-PT': {
    'tray.open': 'Abrir o Supabase Backup',
    'tray.backupAll': 'Fazer backup de todos os projetos agora',
    'tray.quit': 'Sair',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} em execução{queued}',
    'tray.queuedSuffix': ', {queued} em fila',
    'quit.keep': 'Manter em execução',
    'quit.cancelAndQuit': 'Cancelar backups e sair',
    'quit.message.one': '{count} backup ainda está em execução ou em fila.',
    'quit.message.other': '{count} backups ainda estão em execução ou em fila.',
    'quit.detail': 'Sair agora cancela os backups. Os agendamentos só são executados enquanto a aplicação está aberta.',
    'notify.backupOk': 'Backup concluído',
    'notify.backupOkBody': '{name} · {size} em {duration}',
    'notify.backupFailed': 'O backup falhou',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'Os {total} backups foram concluídos',
    'notify.batchMixed': '{ok} de {total} backups concluídos',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…e mais {count}',
    'notify.batchCancelled': '{count} cancelados',
  },
  es: {
    'tray.open': 'Abrir Supabase Backup',
    'tray.backupAll': 'Hacer copia de seguridad de todos los proyectos ahora',
    'tray.quit': 'Salir',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} en curso{queued}',
    'tray.queuedSuffix': ', {queued} en cola',
    'quit.keep': 'Seguir ejecutándose',
    'quit.cancelAndQuit': 'Cancelar copias y salir',
    'quit.message.one': 'Hay {count} copia de seguridad en curso o en cola.',
    'quit.message.other': 'Hay {count} copias de seguridad en curso o en cola.',
    'quit.detail': 'Si sales ahora, se cancelarán. Las programaciones solo se ejecutan mientras la app está abierta.',
    'notify.backupOk': 'Copia de seguridad completada',
    'notify.backupOkBody': '{name} · {size} en {duration}',
    'notify.backupFailed': 'La copia de seguridad falló',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'Se completaron las {total} copias de seguridad',
    'notify.batchMixed': '{ok} de {total} copias de seguridad completadas',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…y {count} más',
    'notify.batchCancelled': '{count} canceladas',
  },
  fr: {
    'tray.open': 'Ouvrir Supabase Backup',
    'tray.backupAll': 'Sauvegarder tous les projets maintenant',
    'tray.quit': 'Quitter',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} en cours{queued}',
    'tray.queuedSuffix': ', {queued} en attente',
    'quit.keep': 'Continuer l’exécution',
    'quit.cancelAndQuit': 'Annuler les sauvegardes et quitter',
    'quit.message.one': '{count} sauvegarde est encore en cours ou en attente.',
    'quit.message.other': '{count} sauvegardes sont encore en cours ou en attente.',
    'quit.detail': 'Quitter maintenant les annule. Les planifications ne s’exécutent que lorsque l’app est ouverte.',
    'notify.backupOk': 'Sauvegarde terminée',
    'notify.backupOkBody': '{name} · {size} en {duration}',
    'notify.backupFailed': 'Échec de la sauvegarde',
    'notify.backupFailedBody': '{name} : {error}',
    'notify.batchOk': 'Les {total} sauvegardes sont terminées',
    'notify.batchMixed': '{ok} sauvegardes sur {total} terminées',
    'notify.batchFailedLine': '{name} : {error}',
    'notify.batchMore': '…et {count} de plus',
    'notify.batchCancelled': 'Annulées : {count}',
  },
  de: {
    'tray.open': 'Supabase Backup öffnen',
    'tray.backupAll': 'Jetzt alle Projekte sichern',
    'tray.quit': 'Beenden',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} aktiv{queued}',
    'tray.queuedSuffix': ', {queued} in der Warteschlange',
    'quit.keep': 'Weiter ausführen',
    'quit.cancelAndQuit': 'Backups abbrechen und beenden',
    'quit.message.one': '{count} Backup läuft noch oder wartet.',
    'quit.message.other': '{count} Backups laufen noch oder warten.',
    'quit.detail': 'Beim Beenden werden sie abgebrochen. Zeitpläne laufen nur, solange die App geöffnet ist.',
    'notify.backupOk': 'Backup abgeschlossen',
    'notify.backupOkBody': '{name} · {size} in {duration}',
    'notify.backupFailed': 'Backup fehlgeschlagen',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'Alle {total} Backups abgeschlossen',
    'notify.batchMixed': '{ok} von {total} Backups abgeschlossen',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…und {count} weitere',
    'notify.batchCancelled': '{count} abgebrochen',
  },
  it: {
    'tray.open': 'Apri Supabase Backup',
    'tray.backupAll': 'Esegui ora il backup di tutti i progetti',
    'tray.quit': 'Esci',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} in corso{queued}',
    'tray.queuedSuffix': ', {queued} in coda',
    'quit.keep': 'Continua l’esecuzione',
    'quit.cancelAndQuit': 'Annulla i backup ed esci',
    'quit.message.one': '{count} backup è ancora in corso o in coda.',
    'quit.message.other': '{count} backup sono ancora in corso o in coda.',
    'quit.detail': 'Uscendo ora verranno annullati. Le pianificazioni vengono eseguite solo mentre l’app è aperta.',
    'notify.backupOk': 'Backup completato',
    'notify.backupOkBody': '{name} · {size} in {duration}',
    'notify.backupFailed': 'Backup non riuscito',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'Tutti i {total} backup completati',
    'notify.batchMixed': '{ok} backup su {total} completati',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…e altri {count}',
    'notify.batchCancelled': '{count} annullati',
  },
  nl: {
    'tray.open': 'Supabase Backup openen',
    'tray.backupAll': 'Nu een back-up maken van alle projecten',
    'tray.quit': 'Afsluiten',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} actief{queued}',
    'tray.queuedSuffix': ', {queued} in de wachtrij',
    'quit.keep': 'Laten draaien',
    'quit.cancelAndQuit': 'Back-ups annuleren en afsluiten',
    'quit.message.one': '{count} back-up is nog bezig of staat in de wachtrij.',
    'quit.message.other': '{count} back-ups zijn nog bezig of staan in de wachtrij.',
    'quit.detail': 'Als je nu afsluit, worden ze geannuleerd. Planningen worden alleen uitgevoerd zolang de app actief is.',
    'notify.backupOk': 'Back-up voltooid',
    'notify.backupOkBody': '{name} · {size} in {duration}',
    'notify.backupFailed': 'Back-up mislukt',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'Alle {total} back-ups voltooid',
    'notify.batchMixed': '{ok} van {total} back-ups voltooid',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…en nog {count}',
    'notify.batchCancelled': '{count} geannuleerd',
  },
  pl: {
    'tray.open': 'Otwórz Supabase Backup',
    'tray.backupAll': 'Utwórz teraz kopie zapasowe wszystkich projektów',
    'tray.quit': 'Zakończ',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — w toku: {running}{queued}',
    'tray.queuedSuffix': ', w kolejce: {queued}',
    'quit.keep': 'Nie zamykaj',
    'quit.cancelAndQuit': 'Anuluj kopie i zakończ',
    'quit.message.one': '{count} kopia zapasowa jest nadal w toku lub w kolejce.',
    'quit.message.few': '{count} kopie zapasowe są nadal w toku lub w kolejce.',
    'quit.message.many': '{count} kopii zapasowych jest nadal w toku lub w kolejce.',
    'quit.message.other': '{count} kopii zapasowej jest nadal w toku lub w kolejce.',
    'quit.detail': 'Zakończenie teraz je anuluje. Harmonogramy działają tylko wtedy, gdy aplikacja jest uruchomiona.',
    'notify.backupOk': 'Kopia zapasowa ukończona',
    'notify.backupOkBody': '{name} · {size} w {duration}',
    'notify.backupFailed': 'Kopia zapasowa nie powiodła się',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'Ukończono wszystkie kopie zapasowe ({total})',
    'notify.batchMixed': 'Ukończono {ok} z {total} kopii zapasowych',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…i jeszcze {count}',
    'notify.batchCancelled': 'Anulowano: {count}',
  },
  ru: {
    'tray.open': 'Открыть Supabase Backup',
    'tray.backupAll': 'Создать резервные копии всех проектов сейчас',
    'tray.quit': 'Выйти',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — выполняется: {running}{queued}',
    'tray.queuedSuffix': ', в очереди: {queued}',
    'quit.keep': 'Продолжить работу',
    'quit.cancelAndQuit': 'Отменить копирование и выйти',
    'quit.message.one': '{count} резервная копия ещё создаётся или ждёт в очереди.',
    'quit.message.few': '{count} резервные копии ещё создаются или ждут в очереди.',
    'quit.message.many': '{count} резервных копий ещё создаются или ждут в очереди.',
    'quit.message.other': '{count} резервной копии ещё создаются или ждут в очереди.',
    'quit.detail': 'Если выйти сейчас, они будут отменены. Расписания работают, только пока приложение запущено.',
    'notify.backupOk': 'Резервная копия создана',
    'notify.backupOkBody': '{name} · {size} за {duration}',
    'notify.backupFailed': 'Ошибка резервного копирования',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'Все резервные копии созданы ({total})',
    'notify.batchMixed': 'Создано резервных копий: {ok} из {total}',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…и ещё {count}',
    'notify.batchCancelled': 'Отменено: {count}',
  },
  tr: {
    'tray.open': 'Supabase Backup’ı aç',
    'tray.backupAll': 'Tüm projeleri şimdi yedekle',
    'tray.quit': 'Çık',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} çalışıyor{queued}',
    'tray.queuedSuffix': ', {queued} sırada',
    'quit.keep': 'Çalışmaya devam et',
    'quit.cancelAndQuit': 'Yedeklemeleri iptal et ve çık',
    'quit.message.one': '{count} yedekleme hâlâ çalışıyor veya sırada.',
    'quit.message.other': '{count} yedekleme hâlâ çalışıyor veya sırada.',
    'quit.detail': 'Şimdi çıkarsanız iptal edilirler. Zamanlamalar yalnızca uygulama açıkken çalışır.',
    'notify.backupOk': 'Yedekleme tamamlandı',
    'notify.backupOkBody': '{name} · {duration} içinde {size}',
    'notify.backupFailed': 'Yedekleme başarısız oldu',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': '{total} yedeklemenin tümü tamamlandı',
    'notify.batchMixed': '{total} yedeklemeden {ok} tanesi tamamlandı',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…ve {count} tane daha',
    'notify.batchCancelled': '{count} iptal edildi',
  },
  ja: {
    'tray.open': 'Supabase Backup を開く',
    'tray.backupAll': 'すべてのプロジェクトを今すぐバックアップ',
    'tray.quit': '終了',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — 実行中 {running} 件{queued}',
    'tray.queuedSuffix': '、待機中 {queued} 件',
    'quit.keep': '実行を続ける',
    'quit.cancelAndQuit': 'バックアップを中止して終了',
    'quit.message.one': '{count} 件のバックアップが実行中または待機中です。',
    'quit.message.other': '{count} 件のバックアップが実行中または待機中です。',
    'quit.detail': '今終了するとキャンセルされます。スケジュールはアプリの実行中にのみ動作します。',
    'notify.backupOk': 'バックアップが完了しました',
    'notify.backupOkBody': '{name} · {size}（{duration}）',
    'notify.backupFailed': 'バックアップに失敗しました',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': '{total} 件のバックアップがすべて完了しました',
    'notify.batchMixed': '{total} 件中 {ok} 件のバックアップが完了しました',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…ほか {count} 件',
    'notify.batchCancelled': '{count} 件をキャンセルしました',
  },
  ko: {
    'tray.open': 'Supabase Backup 열기',
    'tray.backupAll': '지금 모든 프로젝트 백업',
    'tray.quit': '종료',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running}개 실행 중{queued}',
    'tray.queuedSuffix': ', {queued}개 대기 중',
    'quit.keep': '계속 실행',
    'quit.cancelAndQuit': '백업 취소 후 종료',
    'quit.message.one': '백업 {count}개가 아직 실행 중이거나 대기 중입니다.',
    'quit.message.other': '백업 {count}개가 아직 실행 중이거나 대기 중입니다.',
    'quit.detail': '지금 종료하면 취소됩니다. 예약된 백업은 앱이 실행 중일 때만 실행됩니다.',
    'notify.backupOk': '백업 완료',
    'notify.backupOkBody': '{name} · {size}, {duration} 소요',
    'notify.backupFailed': '백업 실패',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': '백업 {total}개 모두 완료',
    'notify.batchMixed': '백업 {total}개 중 {ok}개 완료',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…외 {count}개',
    'notify.batchCancelled': '{count}개 취소됨',
  },
  'zh-CN': {
    'tray.open': '打开 Supabase Backup',
    'tray.backupAll': '立即备份所有项目',
    'tray.quit': '退出',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} 个正在运行{queued}',
    'tray.queuedSuffix': '，{queued} 个排队中',
    'quit.keep': '继续运行',
    'quit.cancelAndQuit': '取消备份并退出',
    'quit.message.one': '仍有 {count} 个备份正在运行或排队。',
    'quit.message.other': '仍有 {count} 个备份正在运行或排队。',
    'quit.detail': '现在退出将取消这些备份。计划任务仅在应用运行时执行。',
    'notify.backupOk': '备份完成',
    'notify.backupOkBody': '{name} · {size}，耗时 {duration}',
    'notify.backupFailed': '备份失败',
    'notify.backupFailedBody': '{name}：{error}',
    'notify.batchOk': '全部 {total} 个备份已完成',
    'notify.batchMixed': '{total} 个备份中已完成 {ok} 个',
    'notify.batchFailedLine': '{name}：{error}',
    'notify.batchMore': '…以及其他 {count} 个',
    'notify.batchCancelled': '已取消 {count} 个',
  },
  hi: {
    'tray.open': 'Supabase Backup खोलें',
    'tray.backupAll': 'अभी सभी प्रोजेक्ट का बैकअप लें',
    'tray.quit': 'बंद करें',
    'tray.idle': 'Supabase Backup',
    'tray.activity': 'Supabase Backup — {running} चल रहे हैं{queued}',
    'tray.queuedSuffix': ', {queued} कतार में',
    'quit.keep': 'चलने दें',
    'quit.cancelAndQuit': 'बैकअप रद्द करें और बंद करें',
    'quit.message.one': '{count} बैकअप अभी भी चल रहा है या कतार में है।',
    'quit.message.other': '{count} बैकअप अभी भी चल रहे हैं या कतार में हैं।',
    'quit.detail': 'अभी बंद करने पर ये रद्द हो जाएँगे। शेड्यूल केवल तभी चलते हैं जब ऐप खुला हो।',
    'notify.backupOk': 'बैकअप पूरा हुआ',
    'notify.backupOkBody': '{name} · {duration} में {size}',
    'notify.backupFailed': 'बैकअप विफल रहा',
    'notify.backupFailedBody': '{name}: {error}',
    'notify.batchOk': 'सभी {total} बैकअप पूरे हुए',
    'notify.batchMixed': '{total} में से {ok} बैकअप पूरे हुए',
    'notify.batchFailedLine': '{name}: {error}',
    'notify.batchMore': '…और {count} अन्य',
    'notify.batchCancelled': '{count} रद्द किए गए',
  },
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`))
}

export function translate(lang: MainLanguage, key: MainMessageKey, vars: Record<string, string | number> = {}): string {
  return fill(MESSAGES[lang]?.[key] ?? EN[key], vars)
}

/** Picks the plural form the language's rules give for `count` (one, few, many, other), then fills it in. */
export function translateCount(lang: MainLanguage, base: PluralBase, count: number, vars: Record<string, string | number> = {}): string {
  const messages: Partial<Record<string, string>> = MESSAGES[lang] ?? EN
  const form = new Intl.PluralRules(lang).select(count)
  const template = messages[`${base}.${form}`] ?? messages[`${base}.other`] ?? EN[`${base}.other`]
  return fill(template, { count, ...vars })
}

/** "system" follows the OS locale when the app is translated into it, and English otherwise. */
export function resolveMainLanguage(preference: LanguagePreference, osLocale: string): MainLanguage {
  return resolveLanguagePreference(preference, osLocale)
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
