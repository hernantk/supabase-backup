import { LocalDestination } from './local'
import { S3Destination } from './s3'
import { GCSDestination } from './gcs'
import { AzureDestination } from './azure'

export async function testDestination(
  type: string,
  config: any
): Promise<{ success: boolean; message: string }> {
  try {
    switch (type) {
      case 'local':
        return new LocalDestination(config).test()
      case 's3':
        return new S3Destination(config).test()
      case 'gcs':
        return new GCSDestination(config).test()
      case 'azure':
        return new AzureDestination(config).test()
      default:
        return { success: false, message: `Unknown destination type: ${type}` }
    }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
}
