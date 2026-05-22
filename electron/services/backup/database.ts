import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { getLogger } from '../logger'
import { detectPgDump } from '../pgDumpInstaller'
import type { SupabaseConfig } from '../../preload'

let currentProcess: ChildProcess | null = null

/** Returns the best available pg_dump binary path, or throws with a helpful message. */
async function resolvePgDumpPath(): Promise<string> {
  const info = await detectPgDump()
  if (info.found && info.path) {
    return info.path
  }
  throw new Error(
    'pg_dump is not installed or not found. ' +
    'Go to Settings → pg_dump tab to detect, download, or point to an existing installation.'
  )
}

export async function dumpDatabase(
  config: SupabaseConfig,
  outputDir: string,
  onProgress?: (message: string) => void
): Promise<string> {
  const logger = getLogger()
  const outputFile = path.join(outputDir, `database_${Date.now()}.sql`)

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const pgDumpPath = await resolvePgDumpPath()
  logger.info(`Starting pg_dump: ${pgDumpPath}`)
  onProgress?.('Initiating database dump...')

  return new Promise((resolve, reject) => {
    const args = [
      config.dbUrl,
      '--format=plain',
      '--no-owner',
      '--no-acl',
      '--clean',
      '--if-exists',
      `--file=${outputFile}`,
    ]

    currentProcess = spawn(pgDumpPath, args, {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''

    currentProcess.stderr?.on('data', (data) => {
      const msg = data.toString()
      stderr += msg
      onProgress?.(msg.trim())
    })

    currentProcess.stdout?.on('data', (data) => {
      onProgress?.(data.toString().trim())
    })

    currentProcess.on('close', (code) => {
      currentProcess = null
      if (code === 0) {
        const stats = fs.statSync(outputFile)
        logger.info(`Database dump completed: ${outputFile} (${stats.size} bytes)`)
        onProgress?.(`Database dump completed (${formatBytes(stats.size)})`)
        resolve(outputFile)
      } else {
        const error = `pg_dump failed with exit code ${code}: ${stderr}`
        logger.error(error)
        reject(new Error(error))
      }
    })

    currentProcess.on('error', (err) => {
      currentProcess = null
      const msg = `Failed to start pg_dump: ${err.message}`
      logger.error(msg)
      reject(new Error(msg))
    })
  })
}

export async function testSupabaseConnection(
  config: SupabaseConfig
): Promise<{ success: boolean; message: string }> {
  const logger = getLogger()

  // Guard: empty URL
  if (!config.dbUrl?.trim()) {
    return { success: false, message: 'Database URL is empty. Enter your connection string first.' }
  }

  // Guard: pg_dump must be available
  const pgDumpInfo = await detectPgDump()
  if (!pgDumpInfo.found || !pgDumpInfo.path) {
    return {
      success: false,
      message: 'pg_dump not found. Go to Settings → pg_dump tab to install it, then test again.',
    }
  }

  const pgDumpPath = pgDumpInfo.path
  logger.info(`Testing connection via: ${pgDumpPath}`)

  return new Promise((resolve) => {
    // Probe with a non-existent table name.
    // If credentials are valid pg_dump exits 0 ("no matching tables" warning).
    // If connection fails it exits 1 with a clear FATAL error in stderr.
    const proc = spawn(
      pgDumpPath,
      ['-d', config.dbUrl, '--schema-only', '-t', 'supabase_backup_probe_xyz'],
      { timeout: 15000, killSignal: 'SIGTERM' }
    )

    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code, signal) => {
      // Killed by our 15s timeout
      if (signal === 'SIGTERM') {
        logger.warn('Connection test timed out')
        resolve({ success: false, message: 'Connection timed out after 15 s. Check that the host and port in your Database URL are reachable.' })
        return
      }

      // EXIT 0 — pg_dump connected and finished (likely "no matching tables" warning, which is fine)
      if (code === 0) {
        logger.info('Connection test: SUCCESS')
        resolve({ success: true, message: 'Connection successful!' })
        return
      }

      // EXIT != 0 — parse stderr for a human-readable reason
      logger.warn(`Connection test failed (code ${code}): ${stderr.substring(0, 200)}`)
      const s = stderr.toLowerCase()

      if (s.includes('password authentication failed') || s.includes('authentication failed')) {
        resolve({ success: false, message: 'Authentication failed — wrong password. Check the credentials in your Database URL.' })
      } else if (s.includes('could not translate host name') || s.includes('name or service not known') || s.includes('nodename nor servname provided')) {
        resolve({ success: false, message: 'Host not found. Check the hostname in your Database URL.' })
      } else if (s.includes('connection refused')) {
        resolve({ success: false, message: 'Connection refused — the server is not accepting connections on that port.' })
      } else if (s.includes('could not connect')) {
        resolve({ success: false, message: 'Could not connect. Check the host and port in your Database URL.' })
      } else if (s.includes('database') && s.includes('does not exist')) {
        resolve({ success: false, message: 'Database not found. Check the database name in your Database URL.' })
      } else if (s.includes('role') && s.includes('does not exist')) {
        resolve({ success: false, message: 'User not found. Check the username in your Database URL.' })
      } else if (s.includes('ssl') || s.includes('certificate')) {
        resolve({ success: false, message: 'SSL/TLS error. Try appending ?sslmode=require to your Database URL.' })
      } else if (s.includes('timeout') || s.includes('timed out')) {
        resolve({ success: false, message: 'Connection timed out. Check that the host and port are reachable.' })
      } else {
        // Show the first meaningful error line from pg_dump
        const firstError = stderr
          .split('\n')
          .find((l) => /fatal|error|failed/i.test(l))
          ?.trim()
        resolve({ success: false, message: firstError ?? `Connection failed (pg_dump exit code ${code}).` })
      }
    })

    proc.on('error', (err) => {
      logger.error(`Connection test spawn error: ${err.message}`)
      resolve({ success: false, message: `Failed to run pg_dump: ${err.message}` })
    })
  })
}

export function cancelDatabaseBackup(): void {
  if (currentProcess) {
    currentProcess.kill('SIGTERM')
    currentProcess = null
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
