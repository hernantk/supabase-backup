import archiver from 'archiver'
import fs from 'fs'
import path from 'path'
import { getLogger } from './logger'

export async function compressDirectory(sourceDir: string, outputPath: string): Promise<string> {
  const logger = getLogger()

  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const output = fs.createWriteStream(outputPath)
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } })

    output.on('close', () => {
      logger.info(`Compressed backup: ${outputPath} (${archive.pointer()} bytes)`)
      resolve(outputPath)
    })

    archive.on('error', (err) => {
      logger.error(`Compression error: ${err.message}`)
      reject(err)
    })

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        logger.warn(`Compression warning: ${err.message}`)
      } else {
        reject(err)
      }
    })

    archive.pipe(output)
    archive.directory(sourceDir, false)
    archive.finalize()
  })
}

export async function compressFile(sourceFile: string, outputPath: string): Promise<string> {
  const logger = getLogger()

  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const output = fs.createWriteStream(outputPath)
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } })

    output.on('close', () => {
      logger.info(`Compressed file: ${outputPath} (${archive.pointer()} bytes)`)
      resolve(outputPath)
    })

    archive.on('error', (err) => {
      logger.error(`Compression error: ${err.message}`)
      reject(err)
    })

    archive.pipe(output)
    archive.file(sourceFile, { name: path.basename(sourceFile) })
    archive.finalize()
  })
}
