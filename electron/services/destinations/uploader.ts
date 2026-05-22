import fs from 'fs'
import path from 'path'
import { LocalDestination } from './local'
import { S3Destination } from './s3'
import { GCSDestination } from './gcs'
import { AzureDestination } from './azure'
import { getLogger } from '../logger'
import type { DestinationConfig } from '../../preload'
import type { DestinationProvider } from './local'

export async function uploadToDestinations(
  filePath: string,
  backupId: string,
  config: DestinationConfig,
  destinations: string[],
  onProgress?: (message: string, progress?: number) => void
): Promise<void> {
  const logger = getLogger()
  const totalDestinations = destinations.length
  let completed = 0

  const fileName = fs.statSync(filePath).isDirectory()
    ? `${backupId}.tar.gz`
    : path.basename(filePath)

  for (const dest of destinations) {
    try {
      const provider = getProvider(dest, config)

      if (!provider) {
        logger.warn(`Unknown destination: ${dest}`)
        continue
      }

      onProgress?.(`Uploading to ${dest}...`, Math.round((completed / totalDestinations) * 100))
      await provider.upload(filePath, fileName)
      completed++
      onProgress?.(`Uploaded to ${dest}`, Math.round((completed / totalDestinations) * 100))
    } catch (err: any) {
      logger.error(`Failed to upload to ${dest}: ${err.message}`)
      throw new Error(`Upload to ${dest} failed: ${err.message}`)
    }
  }
}

function getProvider(type: string, config: DestinationConfig): DestinationProvider | null {
  switch (type) {
    case 'local':
      return new LocalDestination(config.local)
    case 's3':
      return new S3Destination(config.s3)
    case 'gcs':
      return new GCSDestination(config.gcs)
    case 'azure':
      return new AzureDestination(config.azure)
    default:
      return null
  }
}
