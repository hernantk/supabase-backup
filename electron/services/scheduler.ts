import cron from 'node-cron'
import { BrowserWindow } from 'electron'
import { runBackup } from './backup/runner'
import { getLogger } from './logger'
import type { AppConfig, SchedulerStatus } from '../preload'

let scheduledTask: cron.ScheduledTask | null = null
let lastRun: string | null = null
let currentCron: string = ''

export function initScheduler(config: AppConfig, mainWindow: BrowserWindow | null): void {
  const logger = getLogger()

  if (config.schedule.enabled && config.schedule.cron) {
    startScheduler(config, mainWindow)
    logger.info(`Scheduler initialized with cron: ${config.schedule.cron}`)
  }
}

export function startScheduler(config: AppConfig, mainWindow: BrowserWindow | null): void {
  const logger = getLogger()

  if (scheduledTask) {
    scheduledTask.stop()
    scheduledTask = null
  }

  if (!config.schedule.cron || !cron.validate(config.schedule.cron)) {
    logger.error(`Invalid cron expression: ${config.schedule.cron}`)
    return
  }

  currentCron = config.schedule.cron

  scheduledTask = cron.schedule(config.schedule.cron, async () => {
    logger.info('Scheduled backup triggered')
    lastRun = new Date().toISOString()

    try {
      const result = await runBackup(
        config,
        {
          include: config.backup.include,
          destinations: getEnabledDestinations(config),
          compress: config.backup.compress,
          encrypt: config.backup.encrypt,
        },
        (progress) => {
          mainWindow?.webContents.send('backup:progress', progress)
        }
      )

      mainWindow?.webContents.send('backup:complete', result)
    } catch (err: any) {
      logger.error(`Scheduled backup failed: ${err.message}`)
    }
  })

  logger.info(`Scheduler started: ${config.schedule.cron}`)
}

export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop()
    scheduledTask = null
  }
  getLogger().info('Scheduler stopped')
}

export function getSchedulerStatus(): SchedulerStatus {
  return {
    running: scheduledTask !== null,
    nextRun: scheduledTask ? getNextRun(currentCron) : null,
    lastRun,
    cron: currentCron,
  }
}

function getEnabledDestinations(config: AppConfig): string[] {
  const destinations: string[] = []
  if (config.destinations.local.enabled) destinations.push('local')
  if (config.destinations.s3.enabled) destinations.push('s3')
  if (config.destinations.gcs.enabled) destinations.push('gcs')
  if (config.destinations.azure.enabled) destinations.push('azure')
  return destinations
}

function getNextRun(cronExpression: string): string | null {
  try {
    // Simple next run calculation
    const interval = cron.validate(cronExpression)
    if (!interval) return null

    // Parse basic cron to estimate next run
    const now = new Date()
    const parts = cronExpression.split(' ')

    if (parts.length >= 5) {
      const [minute, hour] = parts
      const next = new Date(now)

      if (hour !== '*') next.setHours(parseInt(hour))
      if (minute !== '*') next.setMinutes(parseInt(minute))
      next.setSeconds(0)

      if (next <= now) {
        next.setDate(next.getDate() + 1)
      }

      return next.toISOString()
    }

    return null
  } catch {
    return null
  }
}
