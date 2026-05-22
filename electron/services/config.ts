import Store from 'electron-store'
import { app } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import type { AppConfig, ConnectionConfig } from '../preload'

// ─── Default connection ───────────────────────────────────────────────────────

export function makeDefaultConnection(id = 'default', name = 'My Supabase Project'): ConnectionConfig {
  return {
    id,
    name,
    supabase: { url: '', serviceRoleKey: '', dbUrl: '' },
    backup: {
      include: ['database', 'storage'],
      compress: true,
      encrypt: false,
      encryptionPassword: '',
      retention: { enabled: true, keepLast: 7 },
    },
    schedule: { enabled: false, cron: '0 2 * * *' },
  }
}

export function createNewConnection(): ConnectionConfig {
  return makeDefaultConnection(randomUUID(), 'New Connection')
}

// ─── Default config ───────────────────────────────────────────────────────────

const defaultConfig: AppConfig = {
  connections: [makeDefaultConnection()],
  destinations: {
    local: { enabled: true, path: path.join(app.getPath('documents'), 'SupabaseBackups') },
    s3: {
      enabled: false, bucket: '', region: 'us-east-1', endpoint: '',
      accessKeyId: '', secretAccessKey: '', forcePathStyle: false,
    },
    gcs: { enabled: false, bucket: '', credentialsFile: '' },
    azure: { enabled: false, container: '', connectionString: '' },
  },
  notifications: { enabled: false, webhookUrl: '', onSuccess: true, onFailure: true },
}

// ─── Migration from old single-connection format ──────────────────────────────

function migrateConfig(raw: any): AppConfig {
  if (!raw || typeof raw !== 'object') return defaultConfig

  // Old format: raw.supabase existed but raw.connections did not
  if (raw.supabase !== undefined && !Array.isArray(raw.connections)) {
    return {
      connections: [
        {
          ...makeDefaultConnection(),
          supabase: raw.supabase ?? makeDefaultConnection().supabase,
          backup: raw.backup ?? makeDefaultConnection().backup,
          schedule: raw.schedule ?? makeDefaultConnection().schedule,
        },
      ],
      destinations: raw.destinations ?? defaultConfig.destinations,
      notifications: raw.notifications ?? defaultConfig.notifications,
    }
  }

  // New format — ensure every connection has an id
  if (Array.isArray(raw.connections)) {
    raw.connections = raw.connections.map((c: any) => ({
      ...makeDefaultConnection(),
      ...c,
      id: c.id ?? randomUUID(),
    }))
  }

  return { ...defaultConfig, ...raw }
}

// ─── Store ────────────────────────────────────────────────────────────────────

const store = new Store<{ config: AppConfig; history: any[] }>({
  defaults: { config: defaultConfig, history: [] },
  encryptionKey: 'supabase-backup-encryption-key',
})

export function loadConfig(): AppConfig {
  const raw = store.get('config', defaultConfig)
  return migrateConfig(raw)
}

export function saveConfig(config: AppConfig): void {
  store.set('config', config)
}

export function getStore() {
  return store
}
