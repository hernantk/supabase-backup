import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { backupConfig, backupFunctions, type MetaApi } from './projectMeta'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-test-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf-8'))

function fakeApi(overrides: Partial<MetaApi> = {}): MetaApi {
  return {
    listFunctions: vi.fn().mockResolvedValue([{ id: '1', slug: 'hello', name: 'hello', status: 'ACTIVE', version: 2 }, { id: '2', slug: 'bad/slug', name: 'bad', status: 'ACTIVE', version: 1 }]),
    getFunctionBody: vi.fn(async (_ref: string, slug: string) => {
      if (slug === 'bad/slug') throw new Error('boom')
      return Buffer.from('BUNDLE')
    }),
    getProjectConfig: vi.fn(async (_ref: string, kind: string) => ({ kind })),
    listSecrets: vi.fn().mockResolvedValue([{ name: 'KEY', value: 'sha256', updated_at: '2026-01-01' }]),
    listMigrations: vi.fn().mockResolvedValue([{ version: '1', name: 'init' }]),
    listProjects: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as MetaApi
}

describe('backupFunctions', () => {
  it('saves the list and each bundle, and records functions that failed instead of aborting', async () => {
    const result = await backupFunctions(fakeApi(), 'ref', dir)

    expect(result).toEqual({ functions: 2, errors: 1 })
    expect(readJson('functions/functions.json')).toHaveLength(2)
    expect(fs.readFileSync(path.join(dir, 'functions/hello.bundle'), 'utf-8')).toBe('BUNDLE')
    expect(readJson('functions/_errors.json')).toEqual([{ slug: 'bad/slug', error: 'boom' }])
  })

  it('stops when the backup is cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(backupFunctions(fakeApi(), 'ref', dir, undefined, controller.signal)).rejects.toThrow(/cancelled/)
  })
})

describe('backupConfig', () => {
  it('writes project info, every config, secret names without values, and migrations', async () => {
    const result = await backupConfig(fakeApi(), 'ref', dir, { name: 'Prod', region: 'sa-east-1' })

    expect(result.errors).toBe(0)
    expect(readJson('config/project.json')).toMatchObject({ ref: 'ref', name: 'Prod', region: 'sa-east-1' })
    expect(readJson('config/auth.json')).toEqual({ kind: 'auth' })
    expect(readJson('config/secret-names.json')).toEqual([{ name: 'KEY', updated_at: '2026-01-01' }])
    expect(JSON.stringify(readJson('config/secret-names.json'))).not.toContain('sha256')
    expect(readJson('config/migrations.json')).toEqual([{ version: '1', name: 'init' }])
  })

  it('keeps going when one item cannot be read and says which', async () => {
    const api = fakeApi({
      getProjectConfig: vi.fn(async (_ref: string, kind: string) => {
        if (kind === 'realtime') throw new Error('403')
        return { kind }
      }),
    } as Partial<MetaApi>)
    const result = await backupConfig(api, 'ref', dir, { name: 'Prod' })

    expect(result.errors).toBe(1)
    expect(readJson('config/_errors.json')).toEqual([{ item: 'realtime', error: '403' }])
    expect(fs.existsSync(path.join(dir, 'config/auth.json'))).toBe(true)
  })
})
