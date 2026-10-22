import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AuditEntry } from '../shared/managerApi'

const MAX_BYTES = 5 * 1024 * 1024
const file = () => path.join(app.getPath('userData'), 'audit.log')

/** Append-only, local record of what the Manager changed (one JSON object per line). */
export function appendAudit(entry: Omit<AuditEntry, 'at'>): void {
  try {
    const target = file()
    if (fs.existsSync(target) && fs.statSync(target).size > MAX_BYTES) {
      fs.renameSync(target, `${target}.1`)
    }
    const line: AuditEntry = { at: new Date().toISOString(), ...entry, detail: entry.detail?.slice(0, 2000) }
    fs.appendFileSync(target, JSON.stringify(line) + '\n')
  } catch {
    // Auditing must never break the action it describes.
  }
}

/** Newest first. */
export function listAudit(limit: number): AuditEntry[] {
  try {
    const lines = fs.readFileSync(file(), 'utf-8').split('\n').filter(Boolean)
    return lines
      .slice(-Math.max(1, limit))
      .reverse()
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AuditEntry]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}
