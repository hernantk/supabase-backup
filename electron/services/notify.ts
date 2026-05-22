import https from 'https'
import http from 'http'
import { getLogger } from './logger'
import type { BackupResult } from '../preload'

interface NotificationConfig {
  webhookUrl: string
  onSuccess: boolean
  onFailure: boolean
}

export async function sendNotification(
  config: NotificationConfig,
  result: BackupResult
): Promise<void> {
  const logger = getLogger()

  if (!config.webhookUrl) return

  const isSuccess = result.success
  if (isSuccess && !config.onSuccess) return
  if (!isSuccess && !config.onFailure) return

  const payload = buildPayload(result)

  try {
    await postWebhook(config.webhookUrl, payload)
    logger.info(`Notification sent: ${isSuccess ? 'success' : 'failure'}`)
  } catch (err: any) {
    logger.error(`Failed to send notification: ${err.message}`)
  }
}

function buildPayload(result: BackupResult): object {
  const isSuccess = result.success
  const emoji = isSuccess ? '✅' : '❌'
  const status = isSuccess ? 'SUCCESS' : 'FAILED'

  // Discord/Slack compatible payload
  const message = [
    `${emoji} **Supabase Backup ${status}**`,
    '',
    `**ID:** ${result.id}`,
    `**Time:** ${new Date(result.timestamp).toLocaleString()}`,
    `**Duration:** ${formatDuration(result.duration)}`,
    isSuccess ? `**Size:** ${formatBytes(result.size)}` : `**Error:** ${result.error}`,
    `**Destinations:** ${result.destinations.join(', ') || 'none'}`,
  ].join('\n')

  // Try to be compatible with both Slack and Discord
  return {
    // Discord
    content: message,
    // Slack
    text: message,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: message },
      },
    ],
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
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
        } else {
          reject(new Error(`Webhook returned status ${res.statusCode}`))
        }
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
