import cron from 'node-cron'
import { BrowserWindow } from 'electron'
import { runBackup, isBackupRunning } from './backup/runner'
import { loadConfig } from './config'
import { getLogger } from './logger'
import { getNextCronRun, validateCronExpression } from './cronNext'
import type { AppConfig, BackupResult, CronValidation, SchedulerStatus } from '../preload'

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

/** Connection ids waiting for (or currently holding) a run slot. */
const pendingRuns = new Set<string>()

/** Scheduled runs are executed one after another: the runner only supports a single backup at a time. */
let runQueue: Promise<void> = Promise.resolve()

const BUSY_POLL_MS = 15_000
const BUSY_MAX_WAIT_MS = 2 * 60 * 60 * 1000

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
      running: pendingRuns.has(id),
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

function enqueueRun(connectionId: string): void {
  const logger = getLogger()
  const name = scheduledTasks.get(connectionId)?.connectionName ?? connectionId

  // A run for this connection is already queued/in progress — don't pile up duplicates.
  if (pendingRuns.has(connectionId)) {
    logger.warn(`Scheduled backup for "${name}" skipped: previous run still pending`)
    return
  }

  pendingRuns.add(connectionId)
  runQueue = runQueue
    .then(() => executeScheduledRun(connectionId))
    .catch((err: any) => { logger.error(`Scheduler error for "${name}": ${err?.message ?? err}`) })
    .finally(() => pendingRuns.delete(connectionId))
}

async function executeScheduledRun(connectionId: string): Promise<void> {
  const logger = getLogger()
  const entry = scheduledTasks.get(connectionId)
  const name = entry?.connectionName ?? connectionId

  // Re-read config so it's always up-to-date at run time
  const config = loadConfig()
  const conn = config.connections.find((c) => c.id === connectionId)
  if (!conn || !conn.schedule.enabled) return

  // A manual backup may be running right now — wait for it instead of failing.
  const waitStart = Date.now()
  while (isBackupRunning()) {
    if (Date.now() - waitStart > BUSY_MAX_WAIT_MS) {
      logger.error(`Scheduled backup for "${name}" abandoned: another backup kept running too long`)
      markRun(connectionId, 'failed', 'Another backup was still running')
      return
    }
    await new Promise((resolve) => setTimeout(resolve, BUSY_POLL_MS))
  }

  logger.info(`Scheduled backup triggered for: ${conn.name}`)
  const startedAt = new Date().toISOString()

  try {
    const result = await runBackup(
      config,
      {
        connectionId,
        include: conn.backup.include,
        destinations: getEnabledDestinations(config),
        compress: conn.backup.compress,
        encrypt: conn.backup.encrypt,
      },
      (progress) => sendToWindow('backup:progress', progress)
    )
    markRun(connectionId, 'success', null, startedAt)
    sendToWindow('backup:complete', result)
  } catch (err: any) {
    const message = err?.message ?? 'Backup failed'
    logger.error(`Scheduled backup failed for ${conn.name}: ${message}`)
    markRun(connectionId, 'failed', message, startedAt)

    // Let the UI leave its "running" state — runner throws instead of returning a result.
    const failed: BackupResult = {
      id: `backup_${connectionId}_${Date.now()}`,
      connectionId,
      connectionName: conn.name,
      success: false,
      timestamp: new Date().toISOString(),
      duration: Date.now() - new Date(startedAt).getTime(),
      size: 0,
      destinations: [],
      error: message,
    }
    sendToWindow('backup:complete', failed)
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

function sendToWindow(channel: string, payload: unknown): void {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  win?.webContents.send(channel, payload)
}

function getEnabledDestinations(config: AppConfig): string[] {
  const destinations: string[] = []
  if (config.destinations.local.enabled) destinations.push('local')
  if (config.destinations.s3.enabled) destinations.push('s3')
  if (config.destinations.gcs.enabled) destinations.push('gcs')
  if (config.destinations.azure.enabled) destinations.push('azure')
  return destinations
}
