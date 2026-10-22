import fs from 'fs'
import path from 'path'

export const BUCKET_META_FILE = '_bucket_meta.json'

export interface ArchivedBucket {
  name: string
  public: boolean
  fileSizeLimit?: number
  allowedMimeTypes?: string[]
  files: { relPath: string; absPath: string; size: number }[]
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.json': 'application/json', '.txt': 'text/plain',
  '.csv': 'text/csv', '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.zip': 'application/zip', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

export function contentTypeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

function walk(dir: string, base = ''): { relPath: string; absPath: string; size: number }[] {
  const out: { relPath: string; absPath: string; size: number }[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(abs, rel))
    else if (entry.name !== BUCKET_META_FILE) out.push({ relPath: rel, absPath: abs, size: fs.statSync(abs).size })
  }
  return out
}

/**
 * Reads the `storage/` folder a backup produces: one directory per bucket, an optional
 * `_bucket_meta.json` with its settings, and the files in their original paths.
 */
export function readStorageArchive(storageDir: string): ArchivedBucket[] {
  if (!fs.existsSync(storageDir)) return []
  return fs
    .readdirSync(storageDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = path.join(storageDir, d.name)
      let meta: Record<string, any> = {}
      try {
        meta = JSON.parse(fs.readFileSync(path.join(dir, BUCKET_META_FILE), 'utf-8'))
      } catch {
        // No metadata: the bucket is recreated as private with defaults.
      }
      return {
        name: d.name,
        public: meta.public === true,
        fileSizeLimit: typeof meta.file_size_limit === 'number' ? meta.file_size_limit : undefined,
        allowedMimeTypes: Array.isArray(meta.allowed_mime_types) ? meta.allowed_mime_types : undefined,
        files: walk(dir),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
