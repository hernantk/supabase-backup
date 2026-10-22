import { describe, it, expect } from 'vitest'
import { migrateConfig, mapSecrets, clampConcurrency, type ConfigDefaults } from './configModel'
import type { AppConfig, ConnectionConfig } from '../preload'

function connection(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: 'default',
    name: 'My Supabase Project',
    supabase: { url: '', serviceRoleKey: '', dbUrl: '' },
    backup: {
      include: ['database', 'storage'],
      compress: true,
      encrypt: false,
      encryptionPassword: '',
      retention: { enabled: true, keepLast: 7 },
    },
    schedule: { enabled: false, cron: '0 2 * * *' },
    ...overrides,
  }
}

const baseConfig: AppConfig = {
  connections: [connection()],
  destinations: {
    local: { enabled: true, path: '/backups' },
    s3: {
      enabled: false, bucket: '', region: 'us-east-1', endpoint: '',
      accessKeyId: '', secretAccessKey: '', forcePathStyle: false,
    },
    gcs: { enabled: false, bucket: '', credentialsFile: '' },
    azure: { enabled: false, container: '', connectionString: '' },
  },
  notifications: { enabled: false, webhookUrl: '', onSuccess: true, onFailure: true },
  settings: { maxConcurrentBackups: 2 },
}

let counter = 0
const defaults: ConfigDefaults = {
  config: baseConfig,
  connection: () => connection(),
  newId: () => `generated-${++counter}`,
}

describe('migrateConfig', () => {
  it('falls back to the defaults for missing or invalid input', () => {
    expect(migrateConfig(undefined, defaults)).toBe(baseConfig)
    expect(migrateConfig('nope', defaults)).toBe(baseConfig)
  })

  it('turns the v1.0 single-project format into one connection', () => {
    const raw = {
      supabase: { url: 'https://abc.supabase.co', serviceRoleKey: 'k', dbUrl: 'postgres://x' },
      backup: { ...connection().backup, compress: false },
      schedule: { enabled: true, cron: '0 4 * * *' },
      destinations: baseConfig.destinations,
    }
    const migrated = migrateConfig(raw, defaults)

    expect(migrated.connections).toHaveLength(1)
    expect(migrated.connections[0].supabase.url).toBe('https://abc.supabase.co')
    expect(migrated.connections[0].backup.compress).toBe(false)
    expect(migrated.connections[0].schedule).toEqual({ enabled: true, cron: '0 4 * * *' })
    expect(migrated.settings.maxConcurrentBackups).toBe(2)
  })

  it('keeps every v1.x connection as a standalone project (no account) and fills the new settings', () => {
    const raw = {
      connections: [connection({ id: 'a', name: 'A' }), { name: 'B (no id)' }],
      destinations: baseConfig.destinations,
      notifications: baseConfig.notifications,
    }
    const migrated = migrateConfig(raw, defaults)

    expect(migrated.connections.map((c) => c.name)).toEqual(['A', 'B (no id)'])
    expect(migrated.connections[0].id).toBe('a')
    expect(migrated.connections[1].id).toMatch(/^generated-/)
    expect(migrated.connections.every((c) => c.accountId === undefined)).toBe(true)
    expect(migrated.settings).toEqual({ maxConcurrentBackups: 2 })
  })

  it('is idempotent on a v2 config', () => {
    const once = migrateConfig(baseConfig, defaults)
    const twice = migrateConfig(once, defaults)
    expect(twice).toEqual(once)
  })

  it('clamps an out-of-range concurrency setting', () => {
    const migrated = migrateConfig({ ...baseConfig, settings: { maxConcurrentBackups: 999 } }, defaults)
    expect(migrated.settings.maxConcurrentBackups).toBe(16)
  })
})

describe('clampConcurrency', () => {
  it.each([
    [0, 1],
    [-3, 1],
    [3.9, 3],
    [100, 16],
    ['4', 4],
    [NaN, 2],
    [undefined, 2],
  ])('%s -> %s', (input, expected) => {
    expect(clampConcurrency(input)).toBe(expected)
  })
})

describe('mapSecrets', () => {
  it('transforms every secret field and nothing else', () => {
    const config: AppConfig = {
      ...baseConfig,
      connections: [
        connection({
          supabase: { url: 'https://abc.supabase.co', serviceRoleKey: 'role', dbUrl: 'postgres://pw' },
          backup: { ...connection().backup, encryptionPassword: 'enc-pw' },
        }),
      ],
      destinations: {
        ...baseConfig.destinations,
        s3: { ...baseConfig.destinations.s3, accessKeyId: 'AKIA', secretAccessKey: 's3-secret' },
        azure: { ...baseConfig.destinations.azure, connectionString: 'az-conn' },
      },
      notifications: { ...baseConfig.notifications, webhookUrl: 'https://hooks/x' },
    }

    const mapped = mapSecrets(config, (v) => (v ? `<${v}>` : v))

    expect(mapped.connections[0].supabase).toEqual({
      url: 'https://abc.supabase.co',
      serviceRoleKey: '<role>',
      dbUrl: '<postgres://pw>',
    })
    expect(mapped.connections[0].backup.encryptionPassword).toBe('<enc-pw>')
    expect(mapped.destinations.s3.secretAccessKey).toBe('<s3-secret>')
    expect(mapped.destinations.s3.accessKeyId).toBe('AKIA')
    expect(mapped.destinations.azure.connectionString).toBe('<az-conn>')
    expect(mapped.notifications.webhookUrl).toBe('<https://hooks/x>')
    // The input is not mutated.
    expect(config.connections[0].supabase.serviceRoleKey).toBe('role')
  })
})
