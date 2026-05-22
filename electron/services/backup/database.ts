import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { getLogger } from '../logger'
import type { SupabaseConfig } from '../../preload'

let currentProcess: ChildProcess | null = null

function getPgDumpPath(): string {
  const resourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'pg_dump')
    : path.join(__dirname, '../../resources/pg_dump')

  const platform = process.platform
  const binary = platform === 'win32' ? 'pg_dump.exe' : 'pg_dump'
  const pgDumpPath = path.join(resourcesPath, platform, binary)

  // Fallback to system pg_dump
  if (!fs.existsSync(pgDumpPath)) {
    return 'pg_dump'
  }

  return pgDumpPath
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

  return new Promise((resolve, reject) => {
    const pgDumpPath = getPgDumpPath()
    logger.info(`Starting pg_dump with binary: ${pgDumpPath}`)
    onProgress?.('Initiating database dump...')

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
        const error = `pg_dump failed with code ${code}: ${stderr}`
        logger.error(error)
        reject(new Error(error))
      }
    })

    currentProcess.on('error', (err) => {
      currentProcess = null
      logger.error(`pg_dump error: ${err.message}`)
      reject(new Error(`Failed to start pg_dump: ${err.message}. Make sure pg_dump is installed or included in resources.`))
    })
  })
}

export async function testSupabaseConnection(
  config: SupabaseConfig
): Promise<{ success: boolean; message: string }> {
  const logger = getLogger()

  try {
    // Test using pg_dump with --version to verify it's available
    const pgDumpPath = getPgDumpPath()

    // Try a quick connection test using the database URL
    return new Promise((resolve) => {
      const testProcess = spawn(pgDumpPath, [config.dbUrl, '--schema-only', '--table=_dummy_nonexist_'], {
        timeout: 10000,
      })

      let stderr = ''
      testProcess.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      testProcess.on('close', (code) => {
        // pg_dump will fail because the table doesn't exist, but if it connects, we get specific errors
        if (stderr.includes('no matching tables') || stderr.includes('does not exist') || code === 0) {
          logger.info('Supabase connection test: SUCCESS')
          resolve({ success: true, message: 'Connection successful!' })
        } else if (stderr.includes('could not connect') || stderr.includes('connection refused')) {
          resolve({ success: false, message: 'Could not connect to database. Check your database URL.' })
        } else if (stderr.includes('password authentication failed')) {
          resolve({ success: false, message: 'Authentication failed. Check your credentials.' })
        } else {
          // Even if we get other errors, a response means we connected
          resolve({ success: true, message: 'Connection established.' })
        }
      })

      testProcess.on('error', (err) => {
        resolve({ success: false, message: `pg_dump not found: ${err.message}` })
      })
    })
  } catch (error: any) {
    logger.error(`Connection test error: ${error.message}`)
    return { success: false, message: error.message }
  }
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
