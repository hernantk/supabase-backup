import { getStore } from './config'
import { getLogger } from './logger'
import type { BackupRecord } from '../preload'

export function getBackupHistory(): BackupRecord[] {
  const store = getStore()
  return store.get('history', []) as BackupRecord[]
}

export function addBackupRecord(record: BackupRecord): void {
  const store = getStore()
  const history = store.get('history', []) as BackupRecord[]
  history.unshift(record)

  // Keep max 100 records
  if (history.length > 100) {
    history.splice(100)
  }

  store.set('history', history)
  getLogger().info(`Backup record added: ${record.id} (${record.status})`)
}

export function deleteBackupRecord(id: string): void {
  const store = getStore()
  const history = store.get('history', []) as BackupRecord[]
  const filtered = history.filter((r: BackupRecord) => r.id !== id)
  store.set('history', filtered)
}

export function clearHistory(): void {
  const store = getStore()
  store.set('history', [])
}
