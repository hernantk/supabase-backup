import { loadConfig } from './config'
import { LocalDestination } from './destinations/local'
import { S3Destination } from './destinations/s3'
import { GCSDestination } from './destinations/gcs'
import { AzureDestination } from './destinations/azure'
import { getLogger } from './logger'
import type { AppConfig } from '../preload'
import type { DestinationProvider } from './destinations/local'

export async function applyRetention(config: AppConfig): Promise<void> {
  const logger = getLogger()
  const keepLast = config.backup.retention.keepLast

  if (!config.backup.retention.enabled || keepLast <= 0) return

  logger.info(`Applying retention policy: keep last ${keepLast} backups`)

  const destinations = getEnabledProviders(config)

  for (const [name, provider] of destinations) {
    try {
      const files = await provider.list()

      if (files.length > keepLast) {
        const toDelete = files.slice(keepLast)
        for (const file of toDelete) {
          await provider.delete(file)
          logger.info(`Retention: deleted ${file} from ${name}`)
        }
      }
    } catch (err: any) {
      logger.error(`Retention error for ${name}: ${err.message}`)
    }
  }
}

function getEnabledProviders(config: AppConfig): [string, DestinationProvider][] {
  const providers: [string, DestinationProvider][] = []

  if (config.destinations.local.enabled) {
    providers.push(['local', new LocalDestination(config.destinations.local)])
  }
  if (config.destinations.s3.enabled) {
    providers.push(['s3', new S3Destination(config.destinations.s3)])
  }
  if (config.destinations.gcs.enabled) {
    providers.push(['gcs', new GCSDestination(config.destinations.gcs)])
  }
  if (config.destinations.azure.enabled) {
    providers.push(['azure', new AzureDestination(config.destinations.azure)])
  }

  return providers
}
