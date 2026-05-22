import { createClient, SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import fs from 'fs'
import path from 'path'
import { getLogger } from '../logger'
import type { SupabaseConfig } from '../../preload'

export async function backupStorage(
  config: SupabaseConfig,
  outputDir: string,
  onProgress?: (message: string, progress?: number) => void
): Promise<string> {
  const logger = getLogger()
  const storageDir = path.join(outputDir, 'storage')

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true })
  }

  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
    // Electron's bundled Node.js (v20) has no native WebSocket.
    // Pass the 'ws' package so @supabase/realtime-js doesn't throw at instantiation.
    realtime: { transport: ws as any },
  })

  onProgress?.('Listing storage buckets...')
  logger.info('Starting storage backup...')

  // List all buckets
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()

  if (bucketsError) {
    throw new Error(`Failed to list buckets: ${bucketsError.message}`)
  }

  if (!buckets || buckets.length === 0) {
    logger.info('No storage buckets found')
    onProgress?.('No storage buckets found')
    return storageDir
  }

  logger.info(`Found ${buckets.length} bucket(s)`)
  onProgress?.(`Found ${buckets.length} bucket(s)`)

  let totalFiles = 0
  let downloadedFiles = 0

  // First pass: count all files
  for (const bucket of buckets) {
    const files = await listAllFiles(supabase, bucket.name)
    totalFiles += files.length
  }

  onProgress?.(`Total files to download: ${totalFiles}`)

  // Second pass: download all files
  for (const bucket of buckets) {
    const bucketDir = path.join(storageDir, bucket.name)
    if (!fs.existsSync(bucketDir)) {
      fs.mkdirSync(bucketDir, { recursive: true })
    }

    // Save bucket metadata
    fs.writeFileSync(
      path.join(bucketDir, '_bucket_meta.json'),
      JSON.stringify(bucket, null, 2)
    )

    const files = await listAllFiles(supabase, bucket.name)

    for (const file of files) {
      try {
        const filePath = path.join(bucketDir, file.name)
        const fileDir = path.dirname(filePath)

        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true })
        }

        const { data, error } = await supabase.storage
          .from(bucket.name)
          .download(file.name)

        if (error) {
          logger.warn(`Failed to download ${bucket.name}/${file.name}: ${error.message}`)
          continue
        }

        if (data) {
          const buffer = Buffer.from(await data.arrayBuffer())
          fs.writeFileSync(filePath, buffer)
        }

        downloadedFiles++
        const progress = Math.round((downloadedFiles / totalFiles) * 100)
        onProgress?.(`Downloading: ${bucket.name}/${file.name}`, progress)
      } catch (err: any) {
        logger.warn(`Error downloading ${bucket.name}/${file.name}: ${err.message}`)
      }
    }
  }

  logger.info(`Storage backup completed: ${downloadedFiles}/${totalFiles} files`)
  onProgress?.(`Storage backup completed: ${downloadedFiles}/${totalFiles} files`)

  return storageDir
}

async function listAllFiles(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string = ''
): Promise<{ name: string }[]> {
  const allFiles: { name: string }[] = []
  let offset = 0
  const limit = 1000

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } })

    if (error || !data || data.length === 0) break

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name

      if (item.id === null) {
        // It's a folder, recurse
        const subFiles = await listAllFiles(supabase, bucket, fullPath)
        allFiles.push(...subFiles)
      } else {
        allFiles.push({ name: fullPath })
      }
    }

    if (data.length < limit) break
    offset += limit
  }

  return allFiles
}
