import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { detectPgDump } from '../pgDumpInstaller'
import { decryptFile } from '../encrypt'
import { getLogger } from '../logger'
import { appendAudit } from '../audit'
import { adminClient } from '../manager/context'
import { contentTypeFor, readStorageArchive } from '../../core/storageArchive'
import type { ConnectionConfig, RestoreOptions, RestoreProgress, RestoreResult } from '../../preload'

const UPLOAD_CONCURRENCY = 4

// ── psql path ─────────────────────────────────────────────────────────────────

/** psql ships in the same folder as pg_dump (both come from the same PostgreSQL package). */
async function resolvePsqlPath(): Promise<string> {
  const info = await detectPgDump()
  if (!info.found || !info.path) {
    throw new Error('psql not found. Go to Settings → pg_dump to detect or install it; psql comes in the same package.')
  }
  const psql = path.join(path.dirname(info.path), process.platform === 'win32' ? 'psql.exe' : 'psql')
  if (!fs.existsSync(psql)) {
    throw new Error(`psql binary not found at: ${psql}\nRe-download the pg_dump bundle from Settings → pg_dump to get psql.`)
  }
  return psql
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Restores a backup file into any registered project. Holds no module-level state: cancellation is
 * per run through `signal`, and the job queue keeps it from overlapping a backup of the same project.
 */
export async function restoreBackup(
  connection: ConnectionConfig,
  options: RestoreOptions,
  onProgress: (p: RestoreProgress) => void,
  signal: AbortSignal
): Promise<RestoreResult> {
  const logger = getLogger()
  const wantsDatabase = options.scope.includes('database')
  const wantsStorage = options.scope.includes('storage')
  if (!wantsDatabase && !wantsStorage) throw new Error('Choose what to restore: the database, the storage files, or both.')
  if (options.confirmName.trim() !== connection.name) throw new Error('The name you typed does not match the target project.')
  if (!options.filePath || !fs.existsSync(options.filePath)) throw new Error(`Backup file not found: ${options.filePath}`)
  if (wantsDatabase && !connection.supabase.dbUrl?.trim()) {
    throw new Error('The target project has no database URL. Set its database password (Accounts) or Database URL (Settings).')
  }
  if (wantsStorage && (!connection.supabase.url || !connection.supabase.serviceRoleKey)) {
    throw new Error('The target project has no URL or service-role key, which restoring storage needs.')
  }

  const tempDir = path.join(os.tmpdir(), `supabase-restore-${Date.now()}`)
  fs.mkdirSync(tempDir, { recursive: true })
  const result: RestoreResult = { database: false, storageFiles: 0, storageBuckets: 0, warnings: [] }

  try {
    onProgress({ stage: 'preparing', progress: 3, message: 'Preparing the backup…' })
    const source = await prepareSource(options, tempDir, onProgress, signal)

    if (wantsDatabase) {
      if (!source.sqlFile) {
        throw new Error('No database dump (.sql) was found in this backup. It may contain only storage files.')
      }
      await runPsql(connection.supabase.dbUrl, source.sqlFile, onProgress, signal)
      result.database = true
      appendAudit({ action: 'restore.database', project: connection.name, detail: path.basename(options.filePath) })
    }

    if (wantsStorage) {
      const buckets = source.storageDir ? readStorageArchive(source.storageDir) : []
      if (buckets.length === 0) {
        if (!wantsDatabase) throw new Error('No storage files were found in this backup.')
        result.warnings.push('The backup has no storage files; only the database was restored.')
      } else {
        const uploaded = await restoreStorage(connection, buckets, onProgress, signal)
        result.storageFiles = uploaded.files
        result.storageBuckets = buckets.length
        result.warnings.push(...uploaded.warnings)
        appendAudit({ action: 'restore.storage', project: connection.name, detail: `${uploaded.files} file(s) in ${buckets.length} bucket(s)` })
      }
    }

    onProgress({ stage: 'done', progress: 100, message: 'Restore completed' })
    logger.info(`Restore into "${connection.name}" completed`)
    return result
  } finally {
    cleanup(tempDir)
  }
}

// ── Source preparation ────────────────────────────────────────────────────────

interface PreparedSource {
  sqlFile?: string
  storageDir?: string
}

async function prepareSource(
  options: RestoreOptions,
  tempDir: string,
  onProgress: (p: RestoreProgress) => void,
  signal: AbortSignal
): Promise<PreparedSource> {
  let file = options.filePath

  if (file.endsWith('.enc')) {
    if (!options.password) throw new Error('This backup is encrypted. Enter its password.')
    onProgress({ stage: 'preparing', progress: 8, message: 'Decrypting…' })
    // Decrypt a temp copy so no plaintext is left next to the user's backups.
    const copy = path.join(tempDir, path.basename(file))
    fs.copyFileSync(file, copy)
    file = await decryptFile(copy, options.password)
  }
  if (signal.aborted) throw new Error('Restore cancelled by user')

  if (file.endsWith('.sql')) return { sqlFile: file }

  if (file.endsWith('.tar.gz') || file.endsWith('.tgz')) {
    const extracted = path.join(tempDir, 'extracted')
    fs.mkdirSync(extracted, { recursive: true })
    onProgress({ stage: 'preparing', progress: 15, message: 'Unpacking the archive…' })
    await extractArchive(file, extracted, signal)
    return { sqlFile: findSqlFiles(extracted)[0], storageDir: findStorageDir(extracted) }
  }

  throw new Error('Unsupported backup format. Use a .sql, .tar.gz or encrypted (.enc) backup made by this app.')
}

// ── Database ──────────────────────────────────────────────────────────────────

function runPsql(dbUrl: string, sqlFile: string, onProgress: (p: RestoreProgress) => void, signal: AbortSignal): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let psqlPath: string
    try {
      psqlPath = await resolvePsqlPath()
    } catch (err) {
      return reject(err)
    }
    if (signal.aborted) return reject(new Error('Restore cancelled by user'))

    onProgress({ stage: 'database', progress: 25, message: 'Connecting to the database…' })
    const proc = spawn(psqlPath, [dbUrl, '--file', sqlFile, '--set', 'ON_ERROR_STOP=on', '--echo-errors'], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const onAbort = () => proc.kill('SIGTERM')
    signal.addEventListener('abort', onAbort, { once: true })

    let stderr = ''
    let lines = 0
    const report = (data: Buffer) => {
      for (const line of data.toString().trim().split('\n').filter(Boolean)) {
        lines++
        // psql does not report progress; creep from 25% to 60% as output arrives.
        onProgress({ stage: 'database', progress: Math.min(25 + Math.floor(lines / 5), 60), message: line.trim() })
      }
    }
    proc.stdout?.on('data', report)
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
      report(data)
    })

    proc.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) return reject(new Error('Restore cancelled by user'))
      if (code === 0) return resolve()
      const firstError = stderr.split('\n').find((l) => /error/i.test(l))?.trim() ?? stderr.substring(0, 400).trim()
      reject(new Error(`Restore failed (psql exit code ${code}): ${firstError}`))
    })
    proc.on('error', (err) => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error(`Failed to start psql: ${err.message}`))
    })
  })
}

// ── Storage ───────────────────────────────────────────────────────────────────

async function restoreStorage(
  connection: ConnectionConfig,
  buckets: ReturnType<typeof readStorageArchive>,
  onProgress: (p: RestoreProgress) => void,
  signal: AbortSignal
): Promise<{ files: number; warnings: string[] }> {
  const client = adminClient(connection)
  const warnings: string[] = []
  const { data: existing, error: listError } = await client.storage.listBuckets()
  if (listError) throw new Error(`Could not list the target buckets: ${listError.message}`)
  const have = new Set((existing ?? []).map((b) => b.name))

  const queue: { bucket: string; relPath: string; absPath: string }[] = []
  for (const bucket of buckets) {
    if (!have.has(bucket.name)) {
      const { error } = await client.storage.createBucket(bucket.name, {
        public: bucket.public,
        fileSizeLimit: bucket.fileSizeLimit,
        allowedMimeTypes: bucket.allowedMimeTypes,
      })
      if (error) throw new Error(`Could not create bucket "${bucket.name}": ${error.message}`)
    }
    for (const f of bucket.files) queue.push({ bucket: bucket.name, ...f })
  }

  let done = 0
  let uploaded = 0
  const total = queue.length
  const worker = async () => {
    while (queue.length > 0) {
      if (signal.aborted) throw new Error('Restore cancelled by user')
      const item = queue.shift()!
      const { error } = await client.storage.from(item.bucket).upload(item.relPath, fs.readFileSync(item.absPath), {
        contentType: contentTypeFor(item.relPath),
        upsert: true,
      })
      done++
      if (error) warnings.push(`${item.bucket}/${item.relPath}: ${error.message}`)
      else uploaded++
      onProgress({
        stage: 'storage',
        progress: 62 + Math.round((done / Math.max(total, 1)) * 36),
        message: `Uploading ${item.bucket}/${item.relPath} (${done}/${total})`,
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, Math.max(total, 1)) }, worker))
  return { files: uploaded, warnings }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extracts a .tar.gz with the system `tar` (built into Windows 10+ and every Linux). */
function extractArchive(archivePath: string, destDir: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', archivePath, '-C', destDir], { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' })
    const onAbort = () => proc.kill('SIGTERM')
    signal.addEventListener('abort', onAbort, { once: true })

    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) reject(new Error('Restore cancelled by user'))
      else if (code === 0) resolve()
      else reject(new Error(`Could not unpack the archive (tar exit ${code}): ${stderr.trim()}`))
    })
    proc.on('error', (err) => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error(`Could not run tar: ${err.message}`))
    })
  })
}

/** Dump files are named "database_<project>_<timestamp>.sql". */
function findSqlFiles(dir: string): string[] {
  const results: string[] = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) results.push(...findSqlFiles(full))
    else if (item.name.endsWith('.sql') && item.name.startsWith('database_')) results.push(full)
  }
  return results.sort()
}

function findStorageDir(dir: string): string | undefined {
  const direct = path.join(dir, 'storage')
  if (fs.existsSync(direct)) return direct
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) {
      const nested = findStorageDir(path.join(dir, item.name))
      if (nested) return nested
    }
  }
  return undefined
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}
