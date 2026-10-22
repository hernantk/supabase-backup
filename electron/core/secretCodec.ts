const PREFIX = 'enc:v1:'

/** What the OS-level encryption (Electron safeStorage) has to provide. */
export interface SecretBackend {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

export interface SecretCodec {
  /** Encrypts a secret for storage. Empty, already-encrypted or un-encryptable values pass through. */
  encode(value: string): string
  /** Reverses `encode`. Legacy plaintext values pass through; undecryptable ones become ''. */
  decode(value: string): string
}

export function createSecretCodec(
  backend: SecretBackend,
  onError: (message: string) => void = () => undefined
): SecretCodec {
  return {
    encode(value) {
      if (!value || value.startsWith(PREFIX) || !backend.isAvailable()) return value
      return PREFIX + backend.encrypt(value).toString('base64')
    },
    decode(value) {
      if (!value || !value.startsWith(PREFIX)) return value
      try {
        return backend.decrypt(Buffer.from(value.slice(PREFIX.length), 'base64'))
      } catch (err: any) {
        // Typically the config was copied from another OS user/machine: the key is not ours.
        onError(`Could not decrypt a stored secret: ${err?.message ?? err}`)
        return ''
      }
    },
  }
}
