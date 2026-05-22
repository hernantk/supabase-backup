import Store from 'electron-store'
import { app } from 'electron'
import path from 'path'
import type { AppConfig } from '../preload'

const defaultConfig: AppConfig = {
  supabase: {
    url: '',
    serviceRoleKey: '',
    dbUrl: '',
  },
  backup: {
    include: ['database', 'storage'],
    compress: true,
    encrypt: false,
    encryptionPassword: '',
    retention: {
      enabled: true,
      keepLast: 7,
    },
  },
  destinations: {
    local: {
      enabled: true,
      path: path.join(app.getPath('documents'), 'SupabaseBackups'),
    },
    s3: {
      enabled: false,
      bucket: '',
      region: 'us-east-1',
      endpoint: '',
      accessKeyId: '',
      secretAccessKey: '',
      forcePathStyle: false,
    },
    gcs: {
      enabled: false,
      bucket: '',
      credentialsFile: '',
    },
    azure: {
      enabled: false,
      container: '',
      connectionString: '',
    },
  },
  schedule: {
    enabled: false,
    cron: '0 2 * * *',
  },
  notifications: {
    enabled: false,
    webhookUrl: '',
    onSuccess: true,
    onFailure: true,
  },
}

const store = new Store<{ config: AppConfig; history: any[] }>({
  defaults: {
    config: defaultConfig,
    history: [],
  },
  encryptionKey: 'supabase-backup-encryption-key',
})

export function loadConfig(): AppConfig {
  return store.get('config', defaultConfig)
}

export function saveConfig(config: AppConfig): void {
  store.set('config', config)
}

export function getStore() {
  return store
}
