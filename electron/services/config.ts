import Store from 'electron-store'
import { app, safeStorage } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import type { AppConfig, ConnectionConfig } from '../preload'
import { DEFAULT_SETTINGS, mapSecrets, migrateConfig } from '../core/configModel'
import { createSecretCodec } from '../core/secretCodec'
import { getLogger } from './logger'

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
  notifications: { enabled: false, webhookUrl: '', onSuccess: true, onFailure: true, native: true },
  settings: { ...DEFAULT_SETTINGS },
}

// ─── Secrets at rest ──────────────────────────────────────────────────────────

/** Linux without a keyring falls back to a hard-coded key ("basic_text"), which is not protection. */
function osEncryptionAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text') return false
  return true
}

const secrets = createSecretCodec(
  {
    isAvailable: osEncryptionAvailable,
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(data),
  },
  (message) => getLogger().warn(message)
)

export const secretCodec = secrets

// ─── Store ────────────────────────────────────────────────────────────────────

/** Account as persisted: the personal access token is encrypted and never leaves the main process. */
export interface StoredAccount {
  id: string
  name: string
  token: string
  createdAt: string
}

/** Per-project bookkeeping the scheduler needs to detect runs missed while the app was not running. */
export interface ScheduleStateEntry {
  trackedSince: string
  lastFiredAt?: string
}

const store = new Store<{
  config: AppConfig
  history: any[]
  accounts: StoredAccount[]
  scheduleState: Record<string, ScheduleStateEntry>
}>({
  defaults: { config: defaultConfig, history: [], accounts: [], scheduleState: {} },
  // Obfuscation of the file only; real protection of secrets comes from safeStorage (see secretCodec).
  encryptionKey: 'supabase-backup-encryption-key',
})

function migrate(raw: unknown): AppConfig {
  return migrateConfig(raw, {
    config: defaultConfig,
    connection: () => makeDefaultConnection(),
    newId: () => randomUUID(),
  })
}

/** Returns the config with secrets decrypted, migrated to the current schema. */
export function loadConfig(): AppConfig {
  return mapSecrets(migrate(store.get('config', defaultConfig)), secrets.decode)
}

/** Persists the config with every secret encrypted by the OS keychain. */
export function saveConfig(config: AppConfig): void {
  store.set('config', mapSecrets(config, secrets.encode))
}

export function getStore() {
  return store
}
