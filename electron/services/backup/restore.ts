import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { detectPgDump } from '../pgDumpInstaller'
import { getLogger } from '../logger'
import type { SupabaseConfig, RestoreProgress } from '../../preload'

let currentProcess: ChildProcess | null = null

// ── psql path ─────────────────────────────────────────────────────────────────

/**
 * Derive psql binary from the same directory as pg_dump.
 * Both are bundled together from the EDB PostgreSQL distribution.
 */
function getPsqlPath(pgDumpPath: string): string {
  const dir = path.dirname(pgDumpPath)
  const binary = process.platform === 'win32' ? 'psql.exe' : 'psql'
  return path.join(dir, binary)
}

async function resolvePsqlPath(): Promise<string> {
  const info = await detectPgDump()
  if (!info.found || !info.path) {
    throw new Error(
      'psql not found. Go to Settings → pg_dump tab to detect or install pg_dump — ' +
      'psql is bundled in the same package.'
    )
  }
  const psql = getPsqlPath(info.path)
  if (!fs.existsSync(psql)) {
    throw new Error(
      `psql binary not found at: ${psql}\n` +
      'Re-download the pg_dump bundle from Settings → pg_dump to get psql.'
    )
  }
  return psql
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function restoreDatabase(
  config: SupabaseConfig,
  filePath: string,
  onProgress: (p: RestoreProgress) => void
): Promise<void> {
  const logger = getLogger()

  if (!config.dbUrl?.trim()) {
    throw new Error('Database URL is empty. Configure the connection first.')
  }
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`)
  }

  onProgress({ stage: 'preparing', progress: 5, message: 'Resolving psql binary...' })
  const psqlPath = await resolvePsqlPath()
  logger.info(`Restore using psql: ${psqlPath}`)

  // Determine the actual SQL file to feed to psql
  let sqlFile = filePath
  let tempDir: string | null = null

  if (filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz')) {
    tempDir = path.join(os.tmpdir(), `supabase-restore-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    onProgress({ stage: 'preparing', progress: 15, message: 'Decompressing archive...' })
    await decompressArchive(filePath, tempDir)

    const sqlFiles = findSqlFiles(tempDir)
    if (sqlFiles.length === 0) {
      cleanup(tempDir)
      throw new Error(
        'No database dump (.sql) found inside the archive. ' +
        'This backup may only contain storage files, not a database dump.'
      )
    }
    sqlFile = sqlFiles[0]
    onProgress({ stage: 'preparing', progress: 30, message: `Found: ${path.basename(sqlFile)}` })
  }

  onProgress({ stage: 'restoring', progress: 35, message: 'Connecting to database...' })
  logger.info(`Restoring from SQL file: ${sqlFile}`)

  return new Promise((resolve, reject) => {
    currentProcess = spawn(
      psqlPath,
      [
        config.dbUrl,
        '--file', sqlFile,
        '--set', 'ON_ERROR_STOP=on',
        '--echo-errors',
      ],
      {
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    )

    let stderr = ''
    let lineCount = 0

    currentProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n').filter(Boolean)
      for (const line of lines) {
        lineCount++
        // Fake progress: 35 → 90 during restore (psql doesn't report progress)
        const fakeProgress = Math.min(35 + Math.floor(lineCount / 5), 90)
        onProgress({ stage: 'restoring', progress: fakeProgress, message: line.trim() })
      }
    })

    currentProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      stderr += msg
      const lines = msg.trim().split('\n').filter(Boolean)
      for (const line of lines) {
        lineCount++
        const fakeProgress = Math.min(35 + Math.floor(lineCount / 5), 90)
        onProgress({ stage: 'restoring', progress: fakeProgress, message: line.trim() })
      }
    })

    currentProcess.on('close', (code, signal) => {
      currentProcess = null
      if (tempDir) cleanup(tempDir)

      if (signal === 'SIGTERM') {
        reject(new Error('Restore cancelled by user'))
        return
      }

      if (code === 0) {
        logger.info('Database restore completed successfully')
        onProgress({ stage: 'done', progress: 100, message: 'Restore completed successfully' })
        resolve()
        return
      }

      // Find the first error line from stderr
      const firstError = stderr
        .split('\n')
        .find((l) => /error/i.test(l))
        ?.trim() ?? stderr.substring(0, 400).trim()

      const msg = `Restore failed (psql exit code ${code}): ${firstError}`
      logger.error(msg)
      reject(new Error(msg))
    })

    currentProcess.on('error', (err) => {
      currentProcess = null
      if (tempDir) cleanup(tempDir)
      reject(new Error(`Failed to start psql: ${err.message}`))
    })
  })
}

export function cancelRestore(): void {
  if (currentProcess) {
    currentProcess.kill('SIGTERM')
    currentProcess = null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Decompress a .tar.gz using the system `tar` command (available on Windows 10+ and all Linux). */
function decompressArchive(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', archivePath, '-C', destDir], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Decompression failed (tar exit ${code}): ${stderr.trim()}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(
        `Could not run tar: ${err.message}. ` +
        'Ensure tar is available (built-in on Windows 10+ and all Linux).'
      ))
    })
  })
}

/** Recursively search for SQL files whose names start with "database_". */
function findSqlFiles(dir: string): string[] {
  const results: string[] = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) {
      results.push(...findSqlFiles(full))
    } else if (item.name.endsWith('.sql') && item.name.startsWith('database_')) {
      results.push(full)
    }
  }
  return results.sort()
}

function cleanup(dir: string): void {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  } catch { /* ignore */ }
}
