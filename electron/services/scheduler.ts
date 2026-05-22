import cron from 'node-cron'
import { BrowserWindow } from 'electron'
import { runBackup } from './backup/runner'
import { loadConfig } from './config'
import { getLogger } from './logger'
import type { AppConfig, SchedulerStatus } from '../preload'

// ─── Task registry ────────────────────────────────────────────────────────────

interface TaskEntry {
  task: cron.ScheduledTask
  cron: string
  connectionName: string
  lastRun: string | null
}

const scheduledTasks = new Map<string, TaskEntry>()

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called once at app startup and whenever config is saved.
 * Reconciles running tasks with the current config:
 * - starts tasks for newly enabled connections
 * - stops tasks for disabled / removed connections
 * - restarts tasks whose cron expression changed
 */
export function syncSchedules(config: AppConfig, mainWindow: BrowserWindow | null): void {
  const logger = getLogger()

  // Build map of what should be active
  const shouldBeActive = new Map<string, { cron: string; name: string }>()
  for (const conn of config.connections) {
    if (conn.schedule.enabled && conn.schedule.cron && cron.validate(conn.schedule.cron)) {
      shouldBeActive.set(conn.id, { cron: conn.schedule.cron, name: conn.name })
    }
  }

  // Stop tasks that are no longer needed
  for (const [id, entry] of scheduledTasks) {
    if (!shouldBeActive.has(id)) {
      entry.task.stop()
      scheduledTasks.delete(id)
      logger.info(`Scheduler stopped for: ${entry.connectionName}`)
    }
  }

  // Start or restart tasks as needed
  for (const [id, { cron: cronExpr, name }] of shouldBeActive) {
    const existing = scheduledTasks.get(id)

    // Already running with the same expression — nothing to do
    if (existing && existing.cron === cronExpr) continue

    // Stop stale task if cron changed
    if (existing) {
      existing.task.stop()
    }

    const entry: TaskEntry = {
      task: null as any,
      cron: cronExpr,
      connectionName: name,
      lastRun: existing?.lastRun ?? null,
    }

    entry.task = cron.schedule(cronExpr, async () => {
      const taskEntry = scheduledTasks.get(id)
      if (taskEntry) taskEntry.lastRun = new Date().toISOString()

      logger.info(`Scheduled backup triggered for: ${name}`)

      // Re-read config so it's always up-to-date at run time
      const latestConfig = loadConfig()
      const latestConn = latestConfig.connections.find((c) => c.id === id)
      if (!latestConn || !latestConn.schedule.enabled) return

      try {
        const result = await runBackup(
          latestConfig,
          {
            connectionId: id,
            include: latestConn.backup.include,
            destinations: getEnabledDestinations(latestConfig),
            compress: latestConn.backup.compress,
            encrypt: latestConn.backup.encrypt,
          },
          (progress) => mainWindow?.webContents.send('backup:progress', progress)
        )
        mainWindow?.webContents.send('backup:complete', result)
      } catch (err: any) {
        logger.error(`Scheduled backup failed for ${name}: ${err.message}`)
      }
    })

    scheduledTasks.set(id, entry)
    logger.info(`Scheduler started for: ${name} (${cronExpr})`)
  }
}

/** Called at app startup — same as syncSchedules. */
export function initScheduler(config: AppConfig, mainWindow: BrowserWindow | null): void {
  syncSchedules(config, mainWindow)
  getLogger().info(`Scheduler initialized (${scheduledTasks.size} active tasks)`)
}

/** Stop all running scheduled tasks. */
export function stopAllSchedulers(): void {
  for (const [, entry] of scheduledTasks) {
    entry.task.stop()
  }
  scheduledTasks.clear()
  getLogger().info('All schedulers stopped')
}

/** Returns current scheduler status for all connections. */
export function getSchedulerStatus(): SchedulerStatus {
  return {
    activeCount: scheduledTasks.size,
    connections: Array.from(scheduledTasks.entries()).map(([id, entry]) => ({
      connectionId: id,
      connectionName: entry.connectionName,
      running: true,
      cron: entry.cron,
      nextRun: getNextRun(entry.cron),
      lastRun: entry.lastRun,
    })),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    if (!cron.validate(cronExpression)) return null
    const parts = cronExpression.split(' ')
    if (parts.length < 5) return null

    const [minute, hour] = parts
    const now = new Date()
    const next = new Date(now)

    if (hour !== '*') next.setHours(parseInt(hour))
    if (minute !== '*') next.setMinutes(parseInt(minute))
    next.setSeconds(0)
    next.setMilliseconds(0)

    if (next <= now) next.setDate(next.getDate() + 1)
    return next.toISOString()
  } catch {
    return null
  }
}
