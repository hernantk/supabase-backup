import { randomUUID } from 'crypto'
import { JobQueue, type JobHandle, type JobInfo } from '../../core/jobQueue'
import { runBackup } from './runner'
import { loadConfig } from '../config'
import { getLogger } from '../logger'
import { emitToRenderer } from '../windowBus'
import type {
  AppConfig,
  BackupOptions,
  BackupProgress,
  BackupResult,
  BatchStartResult,
  ConnectionConfig,
} from '../../preload'

export const BACKUP_JOB_KIND = 'backup'

const queue = new JobQueue<BackupProgress>({
  concurrency: 2,
  onEvent: (event) => {
    emitToRenderer('jobs:event', event)
    // Keep the single-backup events alive for screens that have not moved to the queue yet.
    if (event.type === 'progress') {
      emitToRenderer('backup:progress', withJobIds(event.progress, event.job))
    }
  },
})

/** Applies the configured concurrency limit; call at startup and whenever the config is saved. */
export function applyBackupSettings(config: AppConfig): void {
  queue.setConcurrency(config.settings.maxConcurrentBackups)
}

export function listJobs(): JobInfo[] {
  return queue.list()
}

export function isBackupPending(connectionId: string): boolean {
  return queue.hasPending(connectionId, BACKUP_JOB_KIND)
}

export function cancelJob(jobId: string): boolean {
  return queue.cancel(jobId)
}

export function cancelBatch(batchId: string): number {
  return queue.cancelBatch(batchId)
}

export function cancelAllBackups(): number {
  return queue.cancelAll()
}

/** Default options for a project: what it is configured to include, to every enabled destination. */
export function defaultBackupOptions(config: AppConfig, connection: ConnectionConfig): BackupOptions {
  return {
    connectionId: connection.id,
    include: connection.backup.include,
    destinations: enabledDestinations(config),
    compress: connection.backup.compress,
    encrypt: connection.backup.encrypt,
  }
}

/**
 * Queues one backup. The run reloads the config when it actually starts, so a job that waited in the
 * queue never uses stale settings. The returned promise rejects if the backup fails or is cancelled.
 */
export function startBackup(
  options: BackupOptions,
  extra: { batchId?: string; dedupe?: boolean } = {}
): JobHandle<BackupResult> {
  const config = loadConfig()
  const connection = config.connections.find((c) => c.id === options.connectionId)
  if (!connection) {
    throw new Error(
      `Connection not found: "${options.connectionId}". Make sure the connection is configured in Settings.`
    )
  }

  const handle = queue.enqueue<BackupResult>(
    {
      key: connection.id,
      kind: BACKUP_JOB_KIND,
      label: connection.name,
      batchId: extra.batchId,
      run: async ({ jobId, signal, report }) => {
        const info = queue.get(jobId)!
        const fresh = loadConfig()
        const current = fresh.connections.find((c) => c.id === connection.id) ?? connection
        try {
          const result = await runBackup(
            fresh,
            options,
            (progress) => report(withJobIds(progress, info)),
            signal
          )
          const withJob = { ...result, jobId }
          emitToRenderer('backup:complete', withJob)
          return withJob
        } catch (err: any) {
          emitToRenderer('backup:complete', failedResult(jobId, current, err, signal.aborted))
          throw err
        }
      },
    },
    { dedupe: extra.dedupe }
  )

  if (handle.deduped) {
    getLogger().warn(`Backup for "${connection.name}" skipped: a previous run is still pending`)
  }
  return handle
}

/** Queues one backup per project, each with that project's own defaults. */
export function startBatch(connectionIds: string[], options: { dedupe?: boolean } = {}): BatchStartResult {
  const config = loadConfig()
  const batchId = randomUUID()
  const jobs: BatchStartResult['jobs'] = []
  const skipped: string[] = []

  for (const connectionId of new Set(connectionIds)) {
    const connection = config.connections.find((c) => c.id === connectionId)
    if (!connection) {
      skipped.push(connectionId)
      continue
    }
    const handle = startBackup(defaultBackupOptions(config, connection), { batchId, dedupe: options.dedupe })
    jobs.push({ jobId: handle.id, connectionId })
  }

  getLogger().info(`Backup batch ${batchId} queued: ${jobs.length} project(s), ${skipped.length} skipped`)
  return { batchId, jobs, skipped }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withJobIds(progress: BackupProgress, job: JobInfo): BackupProgress {
  return { ...progress, jobId: job.id, connectionId: job.key, connectionName: job.label }
}

function failedResult(jobId: string, connection: ConnectionConfig, err: any, cancelled: boolean): BackupResult {
  return {
    id: `backup_${connection.id}_${Date.now()}`,
    jobId,
    connectionId: connection.id,
    connectionName: connection.name,
    success: false,
    timestamp: new Date().toISOString(),
    duration: 0,
    size: 0,
    destinations: [],
    error: cancelled ? 'Backup cancelled' : (err?.message ?? 'Backup failed'),
  }
}

function enabledDestinations(config: AppConfig): string[] {
  const destinations: string[] = []
  if (config.destinations.local.enabled) destinations.push('local')
  if (config.destinations.s3.enabled) destinations.push('s3')
  if (config.destinations.gcs.enabled) destinations.push('gcs')
  if (config.destinations.azure.enabled) destinations.push('azure')
  return destinations
}
