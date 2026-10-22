import { describe, it, expect } from 'vitest'
import { buildPoolerSessionUrl, buildDirectUrl, pickPrimaryPooler, pickServiceKey } from './dbUrl'

describe('buildPoolerSessionUrl', () => {
  const pooler = { db_user: 'postgres.abcdef', db_host: 'aws-0-sa-east-1.pooler.supabase.com', db_port: 6543, db_name: 'postgres' }

  it('always targets session mode (5432), even when the API reports the transaction port', () => {
    expect(buildPoolerSessionUrl(pooler, 'pw')).toBe(
      'postgresql://postgres.abcdef:pw@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'
    )
  })

  it('percent-encodes passwords with reserved characters', () => {
    const url = buildPoolerSessionUrl(pooler, 'p@ss:w/rd#?')
    expect(url).toContain(':p%40ss%3Aw%2Frd%23%3F@')
    expect(new URL(url).password).toBe('p%40ss%3Aw%2Frd%23%3F')
  })
})

describe('buildDirectUrl', () => {
  it('uses the db.<ref> host and encodes the password', () => {
    expect(buildDirectUrl('abcdef', 'a b')).toBe('postgresql://postgres:a%20b@db.abcdef.supabase.co:5432/postgres')
  })
})

describe('pickPrimaryPooler', () => {
  it('prefers the primary over read replicas', () => {
    const list = [{ database_type: 'READ_REPLICA', id: 1 }, { database_type: 'PRIMARY', id: 2 }]
    expect(pickPrimaryPooler(list)?.id).toBe(2)
  })

  it('falls back to the first entry and handles an empty list', () => {
    expect(pickPrimaryPooler([{ id: 1 } as { database_type?: string; id: number }])?.id).toBe(1)
    expect(pickPrimaryPooler([])).toBeUndefined()
  })
})

describe('pickServiceKey', () => {
  it('prefers the legacy service_role key', () => {
    const keys = [
      { type: 'secret' as const, name: 'default', api_key: 'sb_secret_x' },
      { type: 'legacy' as const, name: 'service_role', api_key: 'jwt' },
    ]
    expect(pickServiceKey(keys)).toBe('jwt')
  })

  it('falls back to a secret key and ignores keys the API did not reveal', () => {
    expect(pickServiceKey([{ type: 'secret', name: 'default', api_key: null }])).toBeUndefined()
    expect(pickServiceKey([{ type: 'secret', name: 'default', api_key: 'sb_secret_x' }])).toBe('sb_secret_x')
  })
})
