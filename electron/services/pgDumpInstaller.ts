import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { app } from 'electron'
import yauzl from 'yauzl'
import { getLogger } from './logger'
import { getStore } from './config'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PgDumpInfo {
  found: boolean
  path: string | null
  version: string | null
  source: 'path' | 'resources' | 'custom' | null
}

export type DownloadPhase = 'downloading' | 'extracting' | 'done' | 'error'

export interface DownloadProgress {
  phase: DownloadPhase
  progress: number      // 0-100
  message: string
  bytesReceived?: number
  bytesTotal?: number
}

export interface WingetProgress {
  phase: 'running' | 'done' | 'error'
  message: string
}

// ─── Platform constants ──────────────────────────────────────────────────────

// PostgreSQL 16 Windows x64 binaries from EnterpriseDB — direct CDN link (~195 MB ZIP)
const WINDOWS_DOWNLOAD_URL =
  'https://get.enterprisedb.com/postgresql/postgresql-16.6-1-windows-x64-binaries.zip'

// Only these files are extracted from the zip (saves ~180 MB of disk space)
const WINDOWS_REQUIRED_FILES: Array<{ from: string; to: string }> = [
  { from: 'pgsql/bin/pg_dump.exe',           to: 'pg_dump.exe' },
  { from: 'pgsql/bin/psql.exe',              to: 'psql.exe' },
  { from: 'pgsql/bin/libpq.dll',             to: 'libpq.dll' },
  { from: 'pgsql/bin/libssl-3-x64.dll',      to: 'libssl-3-x64.dll' },
  { from: 'pgsql/bin/libcrypto-3-x64.dll',   to: 'libcrypto-3-x64.dll' },
  { from: 'pgsql/bin/libintl-9.dll',         to: 'libintl-9.dll' },
  { from: 'pgsql/bin/libiconv-2.dll',        to: 'libiconv-2.dll' },
  { from: 'pgsql/bin/libwinpthread-1.dll',   to: 'libwinpthread-1.dll' },
  { from: 'pgsql/bin/zlib1.dll',             to: 'zlib1.dll' },
  { from: 'pgsql/bin/liblz4.dll',            to: 'liblz4.dll' },
  { from: 'pgsql/bin/libzstd.dll',           to: 'libzstd.dll' },
]

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function getResourcesPgDumpDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'pg_dump', process.platform)
  }
  return path.join(app.getAppPath(), 'resources', 'pg_dump', process.platform)
}

export function getResourcesPgDumpBinary(): string {
  const binary = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump'
  return path.join(getResourcesPgDumpDir(), binary)
}

function getCommonInstallPaths(): string[] {
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
      'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
      'C:\\Program Files (x86)\\PostgreSQL\\16\\bin\\pg_dump.exe',
    ]
  }
  return [
    '/usr/bin/pg_dump',
    '/usr/local/bin/pg_dump',
    '/opt/homebrew/bin/pg_dump',
    '/opt/local/bin/pg_dump',
  ]
}

// ─── Custom path storage ──────────────────────────────────────────────────────

export function getCustomPgDumpPath(): string | null {
  const store = getStore()
  return (store.get('pgDumpPath', null) as string | null)
}

export function setCustomPgDumpPath(customPath: string): void {
  const store = getStore()
  store.set('pgDumpPath', customPath)
}

// ─── Version check ────────────────────────────────────────────────────────────

async function getPgDumpVersion(binaryPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(binaryPath, ['--version'], { timeout: 5000 })
    let out = ''
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', () => {
      const match = out.match(/pg_dump\s+\(PostgreSQL\)\s+([\d.]+)/)
      resolve(match ? match[1] : out.trim().split('\n')[0] || null)
    })
    proc.on('error', () => resolve(null))
  })
}

async function findPgDumpInPath(): Promise<string | null> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const cmd = isWin ? 'where' : 'which'
    const proc = spawn(cmd, ['pg_dump'])
    let out = ''
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', (code) => {
      const first = out.trim().split('\n')[0].trim()
      resolve(code === 0 && first ? first : null)
    })
    proc.on('error', () => resolve(null))
  })
}

// ─── Detection ───────────────────────────────────────────────────────────────

export async function detectPgDump(): Promise<PgDumpInfo> {
  const logger = getLogger()

  // 1. Custom user-defined path
  const custom = getCustomPgDumpPath()
  if (custom && fs.existsSync(custom)) {
    const version = await getPgDumpVersion(custom)
    logger.info(`pg_dump found (custom): ${custom}`)
    return { found: true, path: custom, version, source: 'custom' }
  }

  // 2. Bundled in resources folder
  const resourceBin = getResourcesPgDumpBinary()
  if (fs.existsSync(resourceBin)) {
    const version = await getPgDumpVersion(resourceBin)
    logger.info(`pg_dump found (resources): ${resourceBin}`)
    return { found: true, path: resourceBin, version, source: 'resources' }
  }

  // 3. System PATH
  const pathBin = await findPgDumpInPath()
  if (pathBin) {
    const version = await getPgDumpVersion(pathBin)
    logger.info(`pg_dump found (PATH): ${pathBin}`)
    return { found: true, path: pathBin, version, source: 'path' }
  }

  // 4. Common install directories
  for (const p of getCommonInstallPaths()) {
    if (fs.existsSync(p)) {
      const version = await getPgDumpVersion(p)
      logger.info(`pg_dump found (common path): ${p}`)
      return { found: true, path: p, version, source: 'custom' }
    }
  }

  logger.warn('pg_dump not found on this system')
  return { found: false, path: null, version: null, source: null }
}

// ─── Download (Windows) ───────────────────────────────────────────────────────

let activeDownloadAborted = false

export function abortDownload(): void {
  activeDownloadAborted = true
}

export async function downloadPgDump(
  onProgress: (p: DownloadProgress) => void
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Automatic download is only available on Windows. Use your package manager on Linux.')
  }

  activeDownloadAborted = false
  const logger = getLogger()
  const outputDir = getResourcesPgDumpDir()

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const zipPath = path.join(os.tmpdir(), 'pg_dump_setup.zip')

  // ── Step 1: Download ───────────────────────────────────────────────────────
  onProgress({ phase: 'downloading', progress: 0, message: 'Starting download from EnterpriseDB CDN...' })
  logger.info(`Downloading pg_dump binaries from: ${WINDOWS_DOWNLOAD_URL}`)

  await downloadFile(WINDOWS_DOWNLOAD_URL, zipPath, (received, total) => {
    if (activeDownloadAborted) throw new Error('Download aborted by user')
    const progress = total > 0 ? Math.round((received / total) * 100) : 0
    onProgress({
      phase: 'downloading',
      progress,
      message: `Downloading... ${formatBytes(received)} / ${total > 0 ? formatBytes(total) : 'unknown'}`,
      bytesReceived: received,
      bytesTotal: total,
    })
  })

  if (activeDownloadAborted) {
    cleanupFile(zipPath)
    throw new Error('Download aborted by user')
  }

  // ── Step 1b: Validate it's actually a ZIP ─────────────────────────────────
  logger.info('Validating downloaded file...')
  validateZipMagicBytes(zipPath)

  logger.info(`Download complete: ${zipPath}`)
  onProgress({ phase: 'extracting', progress: 0, message: 'Extracting binaries from archive...' })

  // ── Step 2: Extract only required files ───────────────────────────────────
  await extractRequiredFiles(zipPath, outputDir, WINDOWS_REQUIRED_FILES, (extracted, total) => {
    const progress = Math.round((extracted / total) * 100)
    onProgress({
      phase: 'extracting',
      progress,
      message: `Extracting files... (${extracted}/${total})`,
    })
  })

  // ── Step 3: Cleanup ───────────────────────────────────────────────────────
  cleanupFile(zipPath)
  logger.info(`pg_dump installed successfully to: ${outputDir}`)

  onProgress({ phase: 'done', progress: 100, message: `pg_dump installed to: ${outputDir}` })
}

// ─── Winget install (Windows) ─────────────────────────────────────────────────

export async function installViaWinget(
  onProgress: (p: WingetProgress) => void
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('winget is only available on Windows.')
  }

  const logger = getLogger()
  logger.info('Installing pg_dump via winget...')

  return new Promise((resolve, reject) => {
    // --accept-package-agreements --accept-source-agreements avoids interactive prompts
    const proc = spawn('winget', [
      'install',
      '--id', 'PostgreSQL.PostgreSQL.16',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--silent',
    ], {
      shell: true,
      env: { ...process.env },
    })

    proc.stdout?.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (msg) onProgress({ phase: 'running', message: msg })
    })

    proc.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (msg) onProgress({ phase: 'running', message: msg })
    })

    proc.on('close', (code) => {
      if (code === 0) {
        logger.info('winget install completed successfully')
        onProgress({ phase: 'done', message: 'PostgreSQL installed. Detecting pg_dump...' })
        resolve()
      } else {
        const msg = `winget exited with code ${code}. You may need to run as Administrator or install winget first.`
        logger.error(msg)
        reject(new Error(msg))
      }
    })

    proc.on('error', (err) => {
      const msg = `winget not found: ${err.message}. Install App Installer from the Microsoft Store.`
      logger.error(msg)
      reject(new Error(msg))
    })
  })
}

// ─── Linux install helper ─────────────────────────────────────────────────────

export function getLinuxInstallCommands(): string[] {
  return [
    'sudo apt-get install -y postgresql-client-16   # Debian / Ubuntu',
    'sudo yum install -y postgresql16               # RHEL / CentOS / Fedora',
    'sudo pacman -S postgresql-libs                 # Arch Linux',
  ]
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Download a URL to a local file, following redirects.
 * Sends a browser-like User-Agent so CDN servers don't block the request.
 */
function downloadFile(
  url: string,
  dest: string,
  onProgress: (received: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 10) { reject(new Error('Too many redirects')); return }

      const parsedUrl = new URL(requestUrl)
      const client = parsedUrl.protocol === 'https:' ? https : http

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'application/zip,application/octet-stream,*/*',
        },
      }

      const req = client.request(options, (res) => {
        // Follow redirects
        if (
          res.statusCode === 301 ||
          res.statusCode === 302 ||
          res.statusCode === 303 ||
          res.statusCode === 307 ||
          res.statusCode === 308
        ) {
          const location = res.headers.location
          if (!location) { reject(new Error('Redirect with no Location header')); return }
          // Consume response to free socket
          res.resume()
          doRequest(location, redirectCount + 1)
          return
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage} (${requestUrl})`))
          return
        }

        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const out = fs.createWriteStream(dest)

        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          onProgress(received, total)
        })

        res.pipe(out)
        out.on('finish', () => { out.close(); resolve() })
        out.on('error', reject)
        res.on('error', reject)
      })

      req.on('error', reject)
      req.end()
    }

    doRequest(url)
  })
}

/**
 * Verify the first 4 bytes of the file are the ZIP local-file-header signature PK\x03\x04.
 * Throws a descriptive error if the file is HTML or otherwise not a ZIP.
 */
function validateZipMagicBytes(filePath: string): void {
  const buf = Buffer.alloc(4)
  const fd = fs.openSync(filePath, 'r')
  try {
    fs.readSync(fd, buf, 0, 4, 0)
  } finally {
    fs.closeSync(fd)
  }

  // ZIP magic: 50 4B 03 04
  if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
    // Try to give a helpful snippet of what was actually downloaded
    const snippet = fs.readFileSync(filePath).slice(0, 256).toString('utf8').replace(/\n/g, ' ')
    throw new Error(
      `Downloaded file is not a valid ZIP archive (magic bytes: ${buf.toString('hex')}). ` +
      `The server may have returned an error page. First 256 bytes: ${snippet.substring(0, 200)}`
    )
  }
}

function extractRequiredFiles(
  zipPath: string,
  outputDir: string,
  files: Array<{ from: string; to: string }>,
  onProgress: (extracted: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const targetMap = new Map(files.map((f) => [f.from, f.to]))
    let extracted = 0

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) { reject(err ?? new Error('Failed to open zip')); return }

      zipfile.readEntry()

      zipfile.on('entry', (entry) => {
        const destName = targetMap.get(entry.fileName)
        if (!destName) { zipfile.readEntry(); return }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) { reject(streamErr ?? new Error('No stream')); return }

          const outPath = path.join(outputDir, destName)
          const ws = fs.createWriteStream(outPath)
          readStream.pipe(ws)
          ws.on('finish', () => {
            extracted++
            onProgress(extracted, files.length)
            zipfile.readEntry()
          })
          ws.on('error', reject)
        })
      })

      zipfile.on('end', resolve)
      zipfile.on('error', reject)
    })
  })
}

function cleanupFile(filePath: string): void {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch { /* ignore */ }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
