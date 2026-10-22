import { dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { appendAudit } from '../audit'
import { adminClient, projectContext } from './context'
import type { BucketView, StorageEntry } from '../../shared/managerApi'

const PAGE_SIZE = 1000

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.json': 'application/json', '.txt': 'text/plain',
  '.csv': 'text/csv', '.html': 'text/html', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.zip': 'application/zip',
}

export function joinPath(prefix: string, name: string): string {
  return prefix ? `${prefix.replace(/\/+$/, '')}/${name}` : name
}

export async function listBuckets(connectionId: string): Promise<BucketView[]> {
  const { connection } = projectContext(connectionId)
  const { data, error } = await adminClient(connection).storage.listBuckets()
  if (error) throw new Error(error.message)
  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    public: b.public,
    createdAt: b.created_at,
    fileSizeLimit: (b as { file_size_limit?: number | null }).file_size_limit ?? null,
  }))
}

export async function createBucket(connectionId: string, name: string, isPublic: boolean): Promise<void> {
  const { connection } = projectContext(connectionId)
  const { error } = await adminClient(connection).storage.createBucket(name, { public: isPublic })
  if (error) throw new Error(error.message)
  appendAudit({ action: 'storage.createBucket', project: connection.name, detail: `${name} (${isPublic ? 'public' : 'private'})` })
}

export async function deleteBucket(connectionId: string, name: string): Promise<void> {
  const { connection } = projectContext(connectionId)
  const client = adminClient(connection)
  // Storage refuses to delete a bucket that still has objects.
  const { error: emptyError } = await client.storage.emptyBucket(name)
  if (emptyError) throw new Error(emptyError.message)
  const { error } = await client.storage.deleteBucket(name)
  if (error) throw new Error(error.message)
  appendAudit({ action: 'storage.deleteBucket', project: connection.name, detail: name })
}

export async function listObjects(connectionId: string, bucket: string, prefix: string, search?: string): Promise<StorageEntry[]> {
  const { connection } = projectContext(connectionId)
  const client = adminClient(connection)
  const entries: StorageEntry[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      search: search || undefined,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(error.message)
    for (const item of data ?? []) {
      // Folders come back without an id or metadata.
      const isFolder = item.id === null
      entries.push({
        name: item.name,
        path: joinPath(prefix, item.name),
        kind: isFolder ? 'folder' : 'file',
        size: isFolder ? undefined : (item.metadata?.size as number | undefined),
        mimeType: isFolder ? undefined : (item.metadata?.mimetype as string | undefined),
        updatedAt: item.updated_at ?? undefined,
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }

  // Folders first, then files, like a file manager.
  return entries
    .filter((e) => e.name !== '.emptyFolderPlaceholder')
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1))
}

export async function uploadFiles(connectionId: string, bucket: string, prefix: string): Promise<{ uploaded: number }> {
  const { connection } = projectContext(connectionId)
  const picked = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
  if (picked.canceled || picked.filePaths.length === 0) return { uploaded: 0 }

  const client = adminClient(connection)
  let uploaded = 0
  for (const file of picked.filePaths) {
    const target = joinPath(prefix, path.basename(file))
    const { error } = await client.storage.from(bucket).upload(target, fs.readFileSync(file), {
      contentType: MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      upsert: false,
    })
    if (error) throw new Error(`${path.basename(file)}: ${error.message}`)
    uploaded++
  }
  appendAudit({ action: 'storage.upload', project: connection.name, detail: `${uploaded} file(s) to ${bucket}/${prefix}` })
  return { uploaded }
}

export async function downloadObject(connectionId: string, bucket: string, objectPath: string): Promise<{ savedTo: string | null }> {
  const { connection } = projectContext(connectionId)
  const target = await dialog.showSaveDialog({ defaultPath: path.basename(objectPath) })
  if (target.canceled || !target.filePath) return { savedTo: null }

  const { data, error } = await adminClient(connection).storage.from(bucket).download(objectPath)
  if (error || !data) throw new Error(error?.message ?? 'Download failed')
  fs.writeFileSync(target.filePath, Buffer.from(await data.arrayBuffer()))
  return { savedTo: target.filePath }
}

export async function deleteObjects(connectionId: string, bucket: string, paths: string[]): Promise<void> {
  const { connection } = projectContext(connectionId)
  const { error } = await adminClient(connection).storage.from(bucket).remove(paths)
  if (error) throw new Error(error.message)
  appendAudit({ action: 'storage.delete', project: connection.name, detail: `${bucket}: ${paths.join(', ')}` })
}

/** Public URL for public buckets, otherwise a time-limited signed URL. */
export async function objectUrl(
  connectionId: string,
  bucket: string,
  objectPath: string,
  expiresIn: number
): Promise<{ url: string; signed: boolean }> {
  const { connection } = projectContext(connectionId)
  const client = adminClient(connection)
  const { data: buckets, error: listError } = await client.storage.listBuckets()
  if (listError) throw new Error(listError.message)

  if (buckets?.find((b) => b.name === bucket)?.public) {
    return { url: client.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl, signed: false }
  }
  const { data, error } = await client.storage.from(bucket).createSignedUrl(objectPath, expiresIn)
  if (error || !data) throw new Error(error?.message ?? 'Could not create a signed URL')
  return { url: data.signedUrl, signed: true }
}
