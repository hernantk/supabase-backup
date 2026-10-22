import type { AppConfig, AppSettings, ConnectionConfig } from '../preload'

export const DEFAULT_SETTINGS: AppSettings = {
  maxConcurrentBackups: 2,
  closeToTray: true,
  startWithSystem: false,
  catchUpMissed: true,
  appearance: 'system',
  language: 'system',
}

const APPEARANCES: string[] = ['system', 'light', 'dark']
const LANGUAGES: string[] = ['system', 'en', 'pt-BR']

export const MIN_CONCURRENCY = 1
export const MAX_CONCURRENCY = 16

export function clampConcurrency(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.maxConcurrentBackups
  return Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.floor(n)))
}

export interface ConfigDefaults {
  config: AppConfig
  /** Fresh connection used to fill in fields missing from older configs. */
  connection: () => ConnectionConfig
  newId: () => string
}

/**
 * Brings any stored config (v1 single project, v1.x multi-connection, or v2) to the current shape.
 * Idempotent: running it on a v2 config changes nothing.
 */
export function migrateConfig(raw: any, defaults: ConfigDefaults): AppConfig {
  if (!raw || typeof raw !== 'object') return defaults.config

  let connections: ConnectionConfig[]

  if (raw.supabase !== undefined && !Array.isArray(raw.connections)) {
    // v1.0: one implicit project at the top level.
    const base = defaults.connection()
    connections = [
      {
        ...base,
        supabase: raw.supabase ?? base.supabase,
        backup: raw.backup ?? base.backup,
        schedule: raw.schedule ?? base.schedule,
      },
    ]
  } else if (Array.isArray(raw.connections)) {
    connections = raw.connections.map((c: any) => ({
      ...defaults.connection(),
      ...c,
      id: c.id ?? defaults.newId(),
    }))
  } else {
    connections = defaults.config.connections
  }

  return {
    connections,
    destinations: raw.destinations ?? defaults.config.destinations,
    notifications: raw.notifications ?? defaults.config.notifications,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings ?? {}),
      maxConcurrentBackups: clampConcurrency(raw.settings?.maxConcurrentBackups),
      appearance: APPEARANCES.includes(raw.settings?.appearance) ? raw.settings.appearance : DEFAULT_SETTINGS.appearance,
      language: LANGUAGES.includes(raw.settings?.language) ? raw.settings.language : DEFAULT_SETTINGS.language,
    },
  }
}

/** Returns a copy of the config with `fn` applied to every secret value. */
export function mapSecrets(config: AppConfig, fn: (value: string) => string): AppConfig {
  return {
    ...config,
    connections: config.connections.map((c) => ({
      ...c,
      supabase: {
        ...c.supabase,
        serviceRoleKey: fn(c.supabase.serviceRoleKey),
        dbUrl: fn(c.supabase.dbUrl),
      },
      backup: { ...c.backup, encryptionPassword: fn(c.backup.encryptionPassword) },
    })),
    destinations: {
      ...config.destinations,
      s3: { ...config.destinations.s3, secretAccessKey: fn(config.destinations.s3.secretAccessKey) },
      azure: { ...config.destinations.azure, connectionString: fn(config.destinations.azure.connectionString) },
    },
    // Webhook URLs (Slack, Discord, ...) carry their token in the path.
    notifications: { ...config.notifications, webhookUrl: fn(config.notifications.webhookUrl) },
  }
}
