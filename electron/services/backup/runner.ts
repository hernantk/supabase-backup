import fs from 'fs'
import path from 'path'
import os from 'os'
import { dumpDatabase, cancelDatabaseBackup } from './database'
import { backupStorage } from './storage'
import { compressDirectory } from '../compress'
import { encryptFile } from '../encrypt'
import { uploadToDestinations } from '../destinations/uploader'
import { applyRetention } from '../retention'
import { sendNotification } from '../notify'
import { getLogger } from '../logger'
import { addBackupRecord } from '../history'
import type { AppConfig, BackupOptions, BackupProgress, BackupResult } from '../../preload'

let isRunning = false
let isCancelled = false

export function isBackupRunning(): boolean {
  return isRunning
}

export async function runBackup(
  config: AppConfig,
  options: BackupOptions,
  onProgress: (progress: BackupProgress) => void
): Promise<BackupResult> {
  if (isRunning) {
    throw new Error('A backup is already running')
  }

  // Resolve connection
  const connection = config.connections.find((c) => c.id === options.connectionId)
  if (!connection) {
    throw new Error(`Connection not found: "${options.connectionId}". Make sure the connection is configured in Settings.`)
  }

  isRunning = true
  isCancelled = false

  const logger = getLogger()
  const startTime = Date.now()
  const slug = sanitizeName(connection.name)
  const backupId = `backup_${slug}_${Date.now()}`
  const tempDir = path.join(os.tmpdir(), 'supabase-backup', backupId)

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  logger.info(`Starting backup ${backupId} for connection: ${connection.name}`)

  try {
    const include = options.include

    // ── Step 1: Database dump ────────────────────────────────────────────────
    if (include.includes('database') && !isCancelled) {
      onProgress({ stage: 'database', progress: 0, message: 'Starting database backup...' })

      await dumpDatabase(connection.supabase, slug, tempDir, (msg) => {
        onProgress({ stage: 'database', progress: 50, message: msg })
      })

      onProgress({ stage: 'database', progress: 100, message: 'Database backup completed' })
    }

    // ── Step 2: Storage backup ───────────────────────────────────────────────
    if (include.includes('storage') && !isCancelled) {
      onProgress({ stage: 'storage', progress: 0, message: 'Starting storage backup...' })

      await backupStorage(connection.supabase, tempDir, (msg, progress) => {
        onProgress({ stage: 'storage', progress: progress ?? 0, message: msg })
      })
    }

    if (isCancelled) throw new Error('Backup cancelled by user')

    // ── Step 3: Compress ─────────────────────────────────────────────────────
    let finalFile: string
    if (connection.backup.compress || options.compress) {
      onProgress({ stage: 'compress', progress: 0, message: 'Compressing backup...' })

      finalFile = await compressDirectory(
        tempDir,
        path.join(os.tmpdir(), 'supabase-backup', `${backupId}.tar.gz`)
      )

      onProgress({ stage: 'compress', progress: 100, message: 'Compression completed' })
    } else {
      finalFile = tempDir
    }

    // ── Step 4: Encrypt ──────────────────────────────────────────────────────
    if ((connection.backup.encrypt || options.encrypt) && connection.backup.encryptionPassword) {
      onProgress({ stage: 'encrypt', progress: 0, message: 'Encrypting backup...' })
      finalFile = await encryptFile(finalFile, connection.backup.encryptionPassword)
      onProgress({ stage: 'encrypt', progress: 100, message: 'Encryption completed' })
    }

    if (isCancelled) throw new Error('Backup cancelled by user')

    // ── Step 5: Upload ───────────────────────────────────────────────────────
    onProgress({ stage: 'upload', progress: 0, message: 'Uploading to destinations...' })

    const destinations = options.destinations.length > 0
      ? options.destinations
      : getEnabledDestinations(config)

    await uploadToDestinations(finalFile, backupId, config.destinations, destinations, (msg, progress) => {
      onProgress({ stage: 'upload', progress: progress ?? 0, message: msg })
    })

    onProgress({ stage: 'upload', progress: 100, message: 'Upload completed' })

    // ── Calculate size ───────────────────────────────────────────────────────
    const size = fs.existsSync(finalFile)
      ? fs.statSync(finalFile).isDirectory()
        ? getDirectorySize(finalFile)
        : fs.statSync(finalFile).size
      : 0

    const duration = Date.now() - startTime

    // ── Compute local backup path (if local destination was used) ─────────────
    const localFileName = fs.existsSync(finalFile) && fs.statSync(finalFile).isDirectory()
      ? `${backupId}.tar.gz`
      : path.basename(finalFile)
    const localPath = destinations.includes('local') && config.destinations.local.path
      ? path.join(config.destinations.local.path, localFileName)
      : undefined

    const result: BackupResult = {
      id: backupId,
      connectionId: connection.id,
      connectionName: connection.name,
      success: true,
      timestamp: new Date().toISOString(),
      duration,
      size,
      destinations,
      localPath,
    }

    addBackupRecord({
      ...result,
      type: include,
      status: 'success',
    })

    // Post-backup housekeeping must never turn an already-uploaded backup into a failure.
    if (connection.backup.retention.enabled) {
      try {
        await applyRetention(connection.backup.retention, config.destinations, slug)
      } catch (err: any) {
        logger.warn(`Retention cleanup failed for ${backupId}: ${err.message}`)
      }
    }

    if (config.notifications.enabled && config.notifications.onSuccess) {
      try {
        await sendNotification(config.notifications, result)
      } catch (err: any) {
        logger.warn(`Notification failed for ${backupId}: ${err.message}`)
      }
    }

    logger.info(`Backup ${backupId} completed in ${duration}ms`)
    return result
  } catch (error: any) {
    const duration = Date.now() - startTime
    const result: BackupResult = {
      id: backupId,
      connectionId: connection.id,
      connectionName: connection.name,
      success: false,
      timestamp: new Date().toISOString(),
      duration,
      size: 0,
      destinations: [],
      error: error.message,
    }

    try {
      addBackupRecord({
        ...result,
        type: options.include,
        status: 'failed',
      })

      if (config.notifications.enabled && config.notifications.onFailure) {
        await sendNotification(config.notifications, result)
      }
    } catch (recordErr: any) {
      logger.warn(`Could not record failure of ${backupId}: ${recordErr.message}`)
    }

    logger.error(`Backup ${backupId} failed: ${error.message}`)
    throw error
  } finally {
    // Always release the lock and temp files, otherwise one bad run blocks every future (scheduled) backup.
    cleanupTemp(tempDir)
    cleanupTemp(`${tempDir}.tar.gz`)
    cleanupTemp(`${tempDir}.tar.gz.enc`)
    isRunning = false
  }
}

export async function cancelBackup(): Promise<void> {
  isCancelled = true
  cancelDatabaseBackup()
}

function getEnabledDestinations(config: AppConfig): string[] {
  const destinations: string[] = []
  if (config.destinations.local.enabled) destinations.push('local')
  if (config.destinations.s3.enabled) destinations.push('s3')
  if (config.destinations.gcs.enabled) destinations.push('gcs')
  if (config.destinations.azure.enabled) destinations.push('azure')
  return destinations
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32) || 'unnamed'
}

function getDirectorySize(dirPath: string): number {
  let size = 0
  const files = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name)
    if (file.isDirectory()) {
      size += getDirectorySize(fullPath)
    } else {
      size += fs.statSync(fullPath).size
    }
  }
  return size
}

function cleanupTemp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}
