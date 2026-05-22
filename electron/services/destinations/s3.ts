import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import fs from 'fs'
import { getLogger } from '../logger'
import type { DestinationConfig } from '../../preload'
import type { DestinationProvider } from './local'

export class S3Destination implements DestinationProvider {
  private client: S3Client
  private bucket: string

  constructor(config: DestinationConfig['s3']) {
    const clientConfig: any = {
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }

    // Custom endpoint for S3-compatible services (MinIO, R2, B2, etc.)
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint
      clientConfig.forcePathStyle = config.forcePathStyle ?? true
    }

    this.client = new S3Client(clientConfig)
    this.bucket = config.bucket
  }

  async upload(filePath: string, remoteName: string): Promise<void> {
    const logger = getLogger()
    const fileStream = fs.createReadStream(filePath)
    const fileStats = fs.statSync(filePath)

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: `supabase-backups/${remoteName}`,
      Body: fileStream,
      ContentLength: fileStats.size,
      ContentType: 'application/gzip',
      Metadata: {
        'backup-tool': 'supabase-backup',
        'created-at': new Date().toISOString(),
      },
    })

    await this.client.send(command)
    logger.info(`S3: uploaded to s3://${this.bucket}/supabase-backups/${remoteName}`)
  }

  async list(): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: 'supabase-backups/',
    })

    const response = await this.client.send(command)
    return (response.Contents || [])
      .map((obj) => obj.Key || '')
      .filter(Boolean)
      .sort()
      .reverse()
  }

  async delete(remoteName: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: `supabase-backups/${remoteName}`,
    })

    await this.client.send(command)
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const command = new HeadBucketCommand({ Bucket: this.bucket })
      await this.client.send(command)
      return { success: true, message: `S3 bucket "${this.bucket}" is accessible` }
    } catch (err: any) {
      if (err.name === 'NotFound') {
        return { success: false, message: `Bucket "${this.bucket}" not found` }
      }
      if (err.name === 'Forbidden' || err.$metadata?.httpStatusCode === 403) {
        return { success: false, message: 'Access denied. Check your credentials.' }
      }
      return { success: false, message: `S3 error: ${err.message}` }
    }
  }
}
