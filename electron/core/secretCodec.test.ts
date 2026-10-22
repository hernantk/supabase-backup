import { describe, it, expect } from 'vitest'
import { createSecretCodec, type SecretBackend } from './secretCodec'

// Reversible stand-in for the OS keychain.
const fakeBackend = (available = true): SecretBackend => ({
  isAvailable: () => available,
  encrypt: (plain) => Buffer.from(plain.split('').reverse().join('')),
  decrypt: (data) => data.toString().split('').reverse().join(''),
})

describe('createSecretCodec', () => {
  it('round-trips a secret and never stores it in the clear', () => {
    const codec = createSecretCodec(fakeBackend())
    const stored = codec.encode('super-secret')

    expect(stored).not.toContain('super-secret')
    expect(stored.startsWith('enc:v1:')).toBe(true)
    expect(codec.decode(stored)).toBe('super-secret')
  })

  it('passes empty values through untouched', () => {
    const codec = createSecretCodec(fakeBackend())
    expect(codec.encode('')).toBe('')
    expect(codec.decode('')).toBe('')
  })

  it('does not double-encrypt an already encrypted value', () => {
    const codec = createSecretCodec(fakeBackend())
    const once = codec.encode('abc')
    expect(codec.encode(once)).toBe(once)
  })

  it('reads legacy plaintext values (config written by v1)', () => {
    const codec = createSecretCodec(fakeBackend())
    expect(codec.decode('postgres://legacy')).toBe('postgres://legacy')
  })

  it('keeps the value as-is when OS encryption is unavailable', () => {
    const codec = createSecretCodec(fakeBackend(false))
    expect(codec.encode('abc')).toBe('abc')
  })

  it('returns an empty string and reports when a value cannot be decrypted', () => {
    const errors: string[] = []
    const backend: SecretBackend = {
      ...fakeBackend(),
      decrypt: () => {
        throw new Error('wrong key')
      },
    }
    const codec = createSecretCodec(backend, (m) => errors.push(m))

    expect(codec.decode('enc:v1:AAAA')).toBe('')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('wrong key')
  })
})
