import { BlobServiceClient, ContainerClient } from '@azure/storage-blob'
import fs from 'fs'
import { getLogger } from '../logger'
import type { DestinationConfig } from '../../preload'
import type { DestinationProvider } from './local'

export class AzureDestination implements DestinationProvider {
  private containerClient: ContainerClient

  constructor(config: DestinationConfig['azure']) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(config.connectionString)
    this.containerClient = blobServiceClient.getContainerClient(config.container)
  }

  async upload(filePath: string, remoteName: string): Promise<void> {
    const logger = getLogger()
    const blobName = `supabase-backups/${remoteName}`
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName)

    const fileStream = fs.createReadStream(filePath)
    const fileStats = fs.statSync(filePath)

    await blockBlobClient.uploadStream(fileStream, fileStats.size, undefined, {
      blobHTTPHeaders: { blobContentType: 'application/gzip' },
      metadata: {
        backupTool: 'supabase-backup',
        createdAt: new Date().toISOString(),
      },
    })

    logger.info(`Azure: uploaded to ${this.containerClient.containerName}/${blobName}`)
  }

  async list(): Promise<string[]> {
    const blobs: string[] = []
    for await (const blob of this.containerClient.listBlobsFlat({ prefix: 'supabase-backups/' })) {
      blobs.push(blob.name)
    }
    return blobs.sort().reverse()
  }

  async delete(remoteName: string): Promise<void> {
    const blobName = `supabase-backups/${remoteName}`
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobName)
    await blockBlobClient.delete()
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      const exists = await this.containerClient.exists()
      if (!exists) {
        return { success: false, message: `Container "${this.containerClient.containerName}" not found` }
      }
      return { success: true, message: `Azure container "${this.containerClient.containerName}" is accessible` }
    } catch (err: any) {
      return { success: false, message: `Azure error: ${err.message}` }
    }
  }
}
