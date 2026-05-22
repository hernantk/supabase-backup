import { Storage } from '@google-cloud/storage'
import fs from 'fs'
import { getLogger } from '../logger'
import type { DestinationConfig } from '../../preload'
import type { DestinationProvider } from './local'

export class GCSDestination implements DestinationProvider {
  private storage: Storage
  private bucket: string

  constructor(config: DestinationConfig['gcs']) {
    this.storage = new Storage({
      keyFilename: config.credentialsFile || undefined,
    })
    this.bucket = config.bucket
  }

  async upload(filePath: string, remoteName: string): Promise<void> {
    const logger = getLogger()
    const bucket = this.storage.bucket(this.bucket)
    const destination = `supabase-backups/${remoteName}`

    await bucket.upload(filePath, {
      destination,
      metadata: {
        metadata: {
          'backup-tool': 'supabase-backup',
          'created-at': new Date().toISOString(),
        },
      },
    })

    logger.info(`GCS: uploaded to gs://${this.bucket}/${destination}`)
  }

  async list(): Promise<string[]> {
    const bucket = this.storage.bucket(this.bucket)
    const [files] = await bucket.getFiles({ prefix: 'supabase-backups/' })
    return files.map((f) => f.name).sort().reverse()
  }

  async delete(remoteName: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucket)
    await bucket.file(`supabase-backups/${remoteName}`).delete()
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const bucket = this.storage.bucket(this.bucket)
      const [exists] = await bucket.exists()
      if (!exists) {
        return { success: false, message: `Bucket "${this.bucket}" not found` }
      }
      return { success: true, message: `GCS bucket "${this.bucket}" is accessible` }
    } catch (err: any) {
      return { success: false, message: `GCS error: ${err.message}` }
    }
  }
}
