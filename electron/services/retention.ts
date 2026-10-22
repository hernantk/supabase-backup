import { LocalDestination } from './destinations/local'
import { S3Destination } from './destinations/s3'
import { GCSDestination } from './destinations/gcs'
import { AzureDestination } from './destinations/azure'
import { getLogger } from './logger'
import type { DestinationConfig } from '../preload'
import type { DestinationProvider } from './destinations/local'
import { isUsablePolicy, selectBackupsToKeep, type RetentionPolicy } from '../core/retention'

export interface RetentionConfig extends RetentionPolicy {
  enabled: boolean
}

/**
 * Deletes the backups of ONE connection that the retention policy no longer keeps
 * (the newest `keepLast`, plus optional daily/weekly/monthly layers).
 * Only files named `backup_<slug>_<timestamp>.*` are ever touched, so other connections'
 * backups and unrelated files in the destination are left alone.
 */
export async function applyRetention(
  retention: RetentionConfig,
  destinations: DestinationConfig,
  slug: string
): Promise<void> {
  const logger = getLogger()

  if (!retention.enabled || !isUsablePolicy(retention)) return

  logger.info(
    `Applying retention policy for "${slug}": last ${retention.keepLast}, daily ${retention.keepDaily ?? 0}, weekly ${retention.keepWeekly ?? 0}, monthly ${retention.keepMonthly ?? 0}`
  )

  // Slugs are sanitized to [a-z0-9_-] (see runner.sanitizeName), so they are safe inside a RegExp
  const pattern = new RegExp(`^backup_${slug}_(\\d+)\\.`)

  const providers = getEnabledProviders(destinations)

  for (const [name, provider] of providers) {
    try {
      const backups = (await provider.list())
        .map((file) => ({ file, match: pattern.exec(file) }))
        .filter((b): b is { file: string; match: RegExpExecArray } => b.match !== null)
        .map((b) => ({ file: b.file, time: Number(b.match[1]) }))

      const keep = selectBackupsToKeep(backups.map((b) => b.time), retention)
      for (const { file } of backups.filter((b) => !keep.has(b.time))) {
        try {
          await provider.delete(file)
          logger.info(`Retention: deleted ${file} from ${name}`)
        } catch (err: any) {
          logger.error(`Retention: could not delete ${file} from ${name}: ${err.message}`)
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
