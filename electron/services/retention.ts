import { LocalDestination } from './destinations/local'
import { S3Destination } from './destinations/s3'
import { GCSDestination } from './destinations/gcs'
import { AzureDestination } from './destinations/azure'
import { getLogger } from './logger'
import type { DestinationConfig } from '../preload'
import type { DestinationProvider } from './destinations/local'

export interface RetentionConfig {
  enabled: boolean
  keepLast: number
}

export async function applyRetention(
  retention: RetentionConfig,
  destinations: DestinationConfig
): Promise<void> {
  const logger = getLogger()

  if (!retention.enabled || retention.keepLast <= 0) return

  logger.info(`Applying retention policy: keep last ${retention.keepLast} backups`)

  const providers = getEnabledProviders(destinations)

  for (const [name, provider] of providers) {
    try {
      const files = await provider.list()
      if (files.length > retention.keepLast) {
        const toDelete = files.slice(retention.keepLast)
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

function getEnabledProviders(destinations: DestinationConfig): [string, DestinationProvider][] {
  const providers: [string, DestinationProvider][] = []
  if (destinations.local.enabled) providers.push(['local', new LocalDestination(destinations.local)])
  if (destinations.s3.enabled) providers.push(['s3', new S3Destination(destinations.s3)])
  if (destinations.gcs.enabled) providers.push(['gcs', new GCSDestination(destinations.gcs)])
  if (destinations.azure.enabled) providers.push(['azure', new AzureDestination(destinations.azure)])
  return providers
}
