import https from 'https'
import http from 'http'
import { app, Notification } from 'electron'
import { getLogger } from './logger'
import { loadConfig } from './config'
import {
  batchNotificationText,
  resolveMainLanguage,
  translate,
  type BatchOutcome,
  type MainLanguage,
} from '../core/mainMessages'
import type { AppConfig, BackupResult } from '../preload'

type NotificationSettings = AppConfig['notifications']

/** Language of the main process UI (tray, dialogs, notifications). */
export function mainLanguage(): MainLanguage {
  return resolveMainLanguage(loadConfig().settings.language, app.getLocale())
}

let onClick: (() => void) | undefined

/** What happens when the user clicks a system notification (the app opens its window). */
export function setNotificationClickHandler(handler: () => void): void {
  onClick = handler
}

function showNative(title: string, body: string, quiet: boolean): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, silent: quiet })
  n.on('click', () => onClick?.())
  n.show()
}

/** Whether this outcome should be announced, given the user's success/failure switches. */
function wanted(settings: NotificationSettings, ok: boolean): boolean {
  return ok ? settings.onSuccess : settings.onFailure
}

export async function notifyBackupResult(settings: NotificationSettings, result: BackupResult): Promise<void> {
  if (!wanted(settings, result.success)) return
  const lang = mainLanguage()

  if (settings.native) {
    showNative(
      translate(lang, result.success ? 'notify.backupOk' : 'notify.backupFailed'),
      result.success
        ? translate(lang, 'notify.backupOkBody', { name: result.connectionName, size: formatBytes(result.size), duration: formatDuration(result.duration) })
        : translate(lang, 'notify.backupFailedBody', { name: result.connectionName, error: (result.error ?? '').slice(0, 160) }),
      result.success
    )
  }
  if (settings.enabled && settings.webhookUrl) {
    await sendWebhook(settings.webhookUrl, webhookPayloadForResult(result))
  }
}

/** One summary for a whole batch instead of one message per project. */
export async function notifyBatch(settings: NotificationSettings, outcome: BatchOutcome): Promise<void> {
  const text = batchNotificationText(mainLanguage(), outcome)
  if (!wanted(settings, text.ok)) return

  if (settings.native) showNative(text.title, text.body, text.ok)
  if (settings.enabled && settings.webhookUrl) {
    await sendWebhook(settings.webhookUrl, chatPayload(`${text.ok ? '✅' : '❌'} **${text.title}**${text.body ? `\n\n${text.body}` : ''}`))
  }
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

async function sendWebhook(url: string, payload: object): Promise<void> {
  try {
    await postWebhook(url, payload)
    getLogger().info('Webhook notification sent')
  } catch (err: any) {
    getLogger().error(`Failed to send webhook: ${err.message}`)
  }
}

function webhookPayloadForResult(result: BackupResult): object {
  const emoji = result.success ? '✅' : '❌'
  const status = result.success ? 'SUCCESS' : 'FAILED'
  return chatPayload(
    [
      `${emoji} **Supabase Backup ${status}**`,
      '',
      `**Project:** ${result.connectionName}`,
      `**Time:** ${new Date(result.timestamp).toLocaleString()}`,
      `**Duration:** ${formatDuration(result.duration)}`,
      result.success ? `**Size:** ${formatBytes(result.size)}` : `**Error:** ${result.error}`,
      `**Destinations:** ${result.destinations.join(', ') || 'none'}`,
    ].join('\n')
  )
}

/** Payload both Slack and Discord accept. */
function chatPayload(message: string): object {
  return {
    content: message, // Discord
    text: message, // Slack
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: message } }],
  }
}

function postWebhook(url: string, data: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data)
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'https:' ? https : http

    const req = client.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve()
        else reject(new Error(`Webhook returned status ${res.statusCode}`))
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
