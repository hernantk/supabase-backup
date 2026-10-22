/** True when the URL already says how to use TLS (`sslmode=…`); then it is never second-guessed. */
export function hasExplicitSslMode(url: string): boolean {
  return /[?&]sslmode=/i.test(url)
}

export function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

/**
 * Whether to try TLS before anything else. Supabase's own databases only accept TLS, so that is the
 * default; a URL with an explicit sslmode, or a local address, is left to the driver.
 */
export function shouldTryTlsFirst(url: string): boolean {
  return !hasExplicitSslMode(url) && !isLocalHost(url)
}

/** node-postgres reports a server without TLS support (typical of self-hosted Postgres) with this message. */
export function isTlsRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /does not support ssl/i.test(message)
}
