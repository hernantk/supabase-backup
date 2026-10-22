import { describe, it, expect } from 'vitest'
import { hasExplicitSslMode, isLocalHost, isTlsRefusal, shouldTryTlsFirst } from './pgSsl'

describe('shouldTryTlsFirst', () => {
  it('tries TLS first for remote hosts without an sslmode', () => {
    expect(shouldTryTlsFirst('postgresql://u:p@db.abc.supabase.co:5432/postgres')).toBe(true)
    expect(shouldTryTlsFirst('postgresql://u:p@192.168.1.20:5432/postgres')).toBe(true)
  })

  it('leaves an explicit sslmode alone', () => {
    expect(shouldTryTlsFirst('postgresql://u:p@host:5432/postgres?sslmode=disable')).toBe(false)
    expect(shouldTryTlsFirst('postgresql://u:p@host/postgres?x=1&SSLMODE=require')).toBe(false)
  })

  it('does not force TLS on local addresses', () => {
    expect(shouldTryTlsFirst('postgresql://u:p@localhost:5432/postgres')).toBe(false)
    expect(shouldTryTlsFirst('postgresql://u:p@127.0.0.1:5432/postgres')).toBe(false)
    expect(shouldTryTlsFirst('postgresql://u:p@[::1]:5432/postgres')).toBe(false)
  })
})

describe('hasExplicitSslMode / isLocalHost', () => {
  it('does not mistake a password or path for the parameter', () => {
    expect(hasExplicitSslMode('postgresql://u:sslmode=x@host/db')).toBe(false)
    expect(isLocalHost('not a url')).toBe(false)
  })
})

describe('isTlsRefusal', () => {
  it('recognises the driver message for a server without TLS', () => {
    expect(isTlsRefusal(new Error('The server does not support SSL connections'))).toBe(true)
    expect(isTlsRefusal('the server does not support ssl connections')).toBe(true)
  })

  it('does not treat other failures as a TLS refusal', () => {
    expect(isTlsRefusal(new Error('password authentication failed for user "postgres"'))).toBe(false)
    expect(isTlsRefusal(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toBe(false)
  })
})
