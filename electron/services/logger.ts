import winston from 'winston'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { LogQuery, LogEntry } from '../preload'

const logDir = path.join(app.getPath('userData'), 'logs')

let logger: winston.Logger

export function initLogger(): winston.Logger {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5 * 1024 * 1024, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
      }),
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
    ],
  })

  return logger
}

export function getLogger(): winston.Logger {
  if (!logger) {
    return initLogger()
  }
  return logger
}

export async function queryLogs(options: LogQuery): Promise<LogEntry[]> {
  const logFile = path.join(logDir, 'combined.log')

  if (!fs.existsSync(logFile)) {
    return []
  }

  const content = fs.readFileSync(logFile, 'utf-8')
  const lines = content.trim().split('\n').filter(Boolean)

  let entries: LogEntry[] = lines
    .map((line) => {
      try {
        return JSON.parse(line) as LogEntry
      } catch {
        return null
      }
    })
    .filter((entry): entry is LogEntry => entry !== null)

  // Apply filters
  if (options.level) {
    entries = entries.filter((e) => e.level === options.level)
  }

  if (options.startDate) {
    const start = new Date(options.startDate)
    entries = entries.filter((e) => new Date(e.timestamp) >= start)
  }

  if (options.endDate) {
    const end = new Date(options.endDate)
    entries = entries.filter((e) => new Date(e.timestamp) <= end)
  }

  // Sort by newest first
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Apply pagination
  return entries.slice(options.offset, options.offset + options.limit)
}
