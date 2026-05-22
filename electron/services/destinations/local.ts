import fs from 'fs'
import path from 'path'
import { getLogger } from '../logger'
import type { DestinationConfig } from '../../preload'

export interface DestinationProvider {
  upload(filePath: string, remoteName: string): Promise<void>
  list(): Promise<string[]>
  delete(remoteName: string): Promise<void>
  test(): Promise<{ success: boolean; message: string }>
}

export class LocalDestination implements DestinationProvider {
  private basePath: string

  constructor(config: DestinationConfig['local']) {
    this.basePath = config.path
  }

  async upload(filePath: string, remoteName: string): Promise<void> {
    const logger = getLogger()
    const destPath = path.join(this.basePath, remoteName)
    const destDir = path.dirname(destPath)

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    fs.copyFileSync(filePath, destPath)
    logger.info(`Local: saved to ${destPath}`)
  }

  async list(): Promise<string[]> {
    if (!fs.existsSync(this.basePath)) return []
    return fs.readdirSync(this.basePath).sort().reverse()
  }

  async delete(remoteName: string): Promise<void> {
    const filePath = path.join(this.basePath, remoteName)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  async test(): Promise<{ success: boolean; message: string }> {
    try {
      if (!fs.existsSync(this.basePath)) {
        fs.mkdirSync(this.basePath, { recursive: true })
      }
      // Test write permission
      const testFile = path.join(this.basePath, '.write_test')
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
      return { success: true, message: `Directory accessible: ${this.basePath}` }
    } catch (err: any) {
      return { success: false, message: `Cannot write to directory: ${err.message}` }
    }
  }
}
