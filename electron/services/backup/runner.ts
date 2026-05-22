import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
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

export async function runBackup(
  config: AppConfig,
  options: BackupOptions,
  onProgress: (progress: BackupProgress) => void
): Promise<BackupResult> {
  if (isRunning) {
    throw new Error('A backup is already running')
  }

  isRunning = true
  isCancelled = false

  const logger = getLogger()
  const startTime = Date.now()
  const backupId = `backup_${Date.now()}`
  const tempDir = path.join(os.tmpdir(), 'supabase-backup', backupId)

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  logger.info(`Starting backup ${backupId}`)

  try {
    const include = options.include || config.backup.include
    const filesToUpload: string[] = []

    // Step 1: Database dump
    if (include.includes('database') && !isCancelled) {
      onProgress({
        stage: 'database',
        progress: 0,
        message: 'Starting database backup...',
      })

      const dumpFile = await dumpDatabase(config.supabase, tempDir, (msg) => {
        onProgress({
          stage: 'database',
          progress: 50,
          message: msg,
        })
      })

      filesToUpload.push(dumpFile)
      onProgress({
        stage: 'database',
        progress: 100,
        message: 'Database backup completed',
      })
    }

    // Step 2: Storage backup
    if (include.includes('storage') && !isCancelled) {
      onProgress({
        stage: 'storage',
        progress: 0,
        message: 'Starting storage backup...',
      })

      await backupStorage(config.supabase, tempDir, (msg, progress) => {
        onProgress({
          stage: 'storage',
          progress: progress || 0,
          message: msg,
        })
      })
    }

    if (isCancelled) {
      throw new Error('Backup cancelled by user')
    }

    // Step 3: Compress
    let finalFile: string
    if (config.backup.compress || options.compress) {
      onProgress({
        stage: 'compress',
        progress: 0,
        message: 'Compressing backup...',
      })

      finalFile = await compressDirectory(tempDir, path.join(os.tmpdir(), 'supabase-backup', `${backupId}.tar.gz`))

      onProgress({
        stage: 'compress',
        progress: 100,
        message: 'Compression completed',
      })
    } else {
      finalFile = tempDir
    }

    // Step 4: Encrypt
    if ((config.backup.encrypt || options.encrypt) && config.backup.encryptionPassword) {
      onProgress({
        stage: 'encrypt',
        progress: 0,
        message: 'Encrypting backup...',
      })

      finalFile = await encryptFile(finalFile, config.backup.encryptionPassword)

      onProgress({
        stage: 'encrypt',
        progress: 100,
        message: 'Encryption completed',
      })
    }

    if (isCancelled) {
      throw new Error('Backup cancelled by user')
    }

    // Step 5: Upload to destinations
    onProgress({
      stage: 'upload',
      progress: 0,
      message: 'Uploading to destinations...',
    })

    const destinations = options.destinations || getEnabledDestinations(config)
    await uploadToDestinations(finalFile, backupId, config.destinations, destinations, (msg, progress) => {
      onProgress({
        stage: 'upload',
        progress: progress || 0,
        message: msg,
      })
    })

    onProgress({
      stage: 'upload',
      progress: 100,
      message: 'Upload completed',
    })

    // Calculate size
    const size = fs.existsSync(finalFile)
      ? fs.statSync(finalFile).isDirectory()
        ? getDirectorySize(finalFile)
        : fs.statSync(finalFile).size
      : 0

    const duration = Date.now() - startTime

    const result: BackupResult = {
      id: backupId,
      success: true,
      timestamp: new Date().toISOString(),
      duration,
      size,
      destinations,
    }

    // Save record
    addBackupRecord({
      ...result,
      type: include,
      status: 'success',
    })

    // Apply retention
    if (config.backup.retention.enabled) {
      await applyRetention(config)
    }

    // Send notification
    if (config.notifications.enabled && config.notifications.onSuccess) {
      await sendNotification(config.notifications, result)
    }

    // Cleanup temp
    cleanupTemp(tempDir)

    logger.info(`Backup ${backupId} completed in ${duration}ms`)
    isRunning = false
    return result
  } catch (error: any) {
    const duration = Date.now() - startTime
    const result: BackupResult = {
      id: backupId,
      success: false,
      timestamp: new Date().toISOString(),
      duration,
      size: 0,
      destinations: [],
      error: error.message,
    }

    addBackupRecord({
      ...result,
      type: options.include || config.backup.include,
      status: 'failed',
    })

    if (config.notifications.enabled && config.notifications.onFailure) {
      await sendNotification(config.notifications, result)
    }

    logger.error(`Backup ${backupId} failed: ${error.message}`)
    cleanupTemp(tempDir)
    isRunning = false
    throw error
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
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  } catch {
    // Ignore cleanup errors
  }
}
