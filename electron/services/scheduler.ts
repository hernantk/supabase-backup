import cron from 'node-cron'
import { startBackup, defaultBackupOptions, isBackupPending } from './backup/backupService'
import { loadConfig } from './config'
import { getLogger } from './logger'
import { getNextCronRun, validateCronExpression } from './cronNext'
import type { AppConfig, CronValidation, SchedulerStatus } from '../preload'

// ─── Task registry ────────────────────────────────────────────────────────────

interface TaskEntry {
  task: cron.ScheduledTask
  cron: string
  connectionName: string
  lastRun: string | null
  lastStatus: 'success' | 'failed' | null
  lastError: string | null
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
export function syncSchedules(config: AppConfig): void {
  const logger = getLogger()

  // Build map of what should be active
  const shouldBeActive = new Map<string, { cron: string; name: string }>()
  for (const conn of config.connections) {
    if (!conn.schedule.enabled) continue
    const expr = conn.schedule.cron?.trim()
    if (!expr || !cron.validate(expr) || !validateCronExpression(expr).valid) {
      logger.warn(`Schedule skipped for "${conn.name}": invalid cron expression "${conn.schedule.cron}"`)
      continue
    }
    shouldBeActive.set(conn.id, { cron: expr, name: conn.name })
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

    if (existing && existing.cron === cronExpr) {
      // Same schedule — just keep the display name in sync
      existing.connectionName = name
      continue
    }

    // Stop stale task if cron changed
    existing?.task.stop()

    scheduledTasks.set(id, {
      task: cron.schedule(cronExpr, () => enqueueRun(id)),
      cron: cronExpr,
      connectionName: name,
      lastRun: existing?.lastRun ?? null,
      lastStatus: existing?.lastStatus ?? null,
      lastError: existing?.lastError ?? null,
    })
    logger.info(`Scheduler started for: ${name} (${cronExpr})`)
  }
}

/** Called at app startup — same as syncSchedules. */
export function initScheduler(config: AppConfig): void {
  syncSchedules(config)
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
      running: isBackupPending(id),
      cron: entry.cron,
      nextRun: getNextCronRun(entry.cron)?.toISOString() ?? null,
      lastRun: entry.lastRun,
      lastStatus: entry.lastStatus,
      lastError: entry.lastError,
    })),
  }
}

/** Validates a cron expression and previews its next run (used by the Settings screen). */
export function validateCron(expression: string): CronValidation {
  const expr = (expression ?? '').trim()
  if (!expr) return { valid: false, error: 'Cron expression is empty', nextRun: null }

  const parsed = validateCronExpression(expr)
  if (!parsed.valid || !cron.validate(expr)) {
    return { valid: false, error: parsed.error ?? 'Invalid cron expression', nextRun: null }
  }
  const next = getNextCronRun(expr)
  if (!next) return { valid: false, error: 'This expression never matches a real date', nextRun: null }
  return { valid: true, nextRun: next.toISOString() }
}

// ─── Execution ────────────────────────────────────────────────────────────────

/**
 * Hands the run to the backup queue. The queue owns concurrency and per-project locking, and
 * `dedupe` drops a tick when the previous run of the same project has not finished yet.
 */
function enqueueRun(connectionId: string): void {
  const logger = getLogger()
  const entry = scheduledTasks.get(connectionId)
  const name = entry?.connectionName ?? connectionId

  // Re-read config so it's always up-to-date at trigger time
  const config = loadConfig()
  const conn = config.connections.find((c) => c.id === connectionId)
  if (!conn || !conn.schedule.enabled) return

  logger.info(`Scheduled backup triggered for: ${conn.name}`)
  const startedAt = new Date().toISOString()

  try {
    const handle = startBackup(defaultBackupOptions(config, conn), { dedupe: true })
    if (handle.deduped) return

    handle.promise.then(
      () => markRun(connectionId, 'success', null, startedAt),
      (err: any) => {
        const message = err?.message ?? 'Backup failed'
        logger.error(`Scheduled backup failed for ${name}: ${message}`)
        markRun(connectionId, 'failed', message, startedAt)
      }
    )
  } catch (err: any) {
    logger.error(`Scheduler error for "${name}": ${err?.message ?? err}`)
    markRun(connectionId, 'failed', err?.message ?? 'Backup failed', startedAt)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function markRun(
  connectionId: string,
  status: 'success' | 'failed',
  error: string | null,
  at: string = new Date().toISOString()
): void {
  const entry = scheduledTasks.get(connectionId)
  if (!entry) return
  entry.lastRun = at
  entry.lastStatus = status
  entry.lastError = error
}
