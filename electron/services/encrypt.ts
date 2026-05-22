import crypto from 'crypto'
import fs from 'fs'
import { getLogger } from './logger'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const SALT_LENGTH = 64
const TAG_LENGTH = 16
const ITERATIONS = 100000

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512')
}

export async function encryptFile(inputPath: string, password: string): Promise<string> {
  const logger = getLogger()
  const outputPath = inputPath + '.enc'

  return new Promise((resolve, reject) => {
    try {
      const salt = crypto.randomBytes(SALT_LENGTH)
      const iv = crypto.randomBytes(IV_LENGTH)
      const key = deriveKey(password, salt)

      const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
      const input = fs.createReadStream(inputPath)
      const output = fs.createWriteStream(outputPath)

      // Write salt and IV at the beginning of the file
      output.write(salt)
      output.write(iv)

      input.pipe(cipher)

      cipher.on('data', (chunk) => {
        output.write(chunk)
      })

      cipher.on('end', () => {
        // Write auth tag at the end
        const tag = cipher.getAuthTag()
        output.write(tag)
        output.end()
      })

      output.on('finish', () => {
        // Remove original file
        fs.unlinkSync(inputPath)
        logger.info(`File encrypted: ${outputPath}`)
        resolve(outputPath)
      })

      output.on('error', reject)
      input.on('error', reject)
    } catch (err) {
      reject(err)
    }
  })
}

export async function decryptFile(inputPath: string, password: string): Promise<string> {
  const logger = getLogger()
  const outputPath = inputPath.replace('.enc', '')

  return new Promise((resolve, reject) => {
    try {
      const fileContent = fs.readFileSync(inputPath)

      // Extract salt, IV, encrypted data, and auth tag
      const salt = fileContent.subarray(0, SALT_LENGTH)
      const iv = fileContent.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
      const tag = fileContent.subarray(fileContent.length - TAG_LENGTH)
      const encrypted = fileContent.subarray(SALT_LENGTH + IV_LENGTH, fileContent.length - TAG_LENGTH)

      const key = deriveKey(password, salt)
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(tag)

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
      fs.writeFileSync(outputPath, decrypted)

      logger.info(`File decrypted: ${outputPath}`)
      resolve(outputPath)
    } catch (err: any) {
      if (err.message.includes('Unsupported state')) {
        reject(new Error('Decryption failed: incorrect password or corrupted file'))
      } else {
        reject(err)
      }
    }
  })
}
