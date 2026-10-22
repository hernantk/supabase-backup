import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import net from 'net'
import { runPg } from './pgRunner'

/**
 * A stand-in for a Postgres server without TLS: it answers the SSL request with "N" and then rejects
 * the startup packet with a recognisable error, which shows whether (and how often) the client retried.
 */
function startFakeServer() {
  const seen: ('ssl-request' | 'startup')[] = []
  const server = net.createServer((socket) => {
    socket.once('data', (buf) => {
      const isSslRequest = buf.length === 8 && buf.readInt32BE(4) === 80877103
      seen.push(isSslRequest ? 'ssl-request' : 'startup')
      if (isSslRequest) {
        socket.write('N')
        socket.once('data', () => {
          seen.push('startup')
          socket.end(errorResponse('fake server: authentication not configured'))
        })
      } else {
        socket.end(errorResponse('fake server: authentication not configured'))
      }
    })
    socket.on('error', () => undefined)
  })
  return new Promise<{ port: number; seen: typeof seen; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '0.0.0.0', () => {
      const { port } = server.address() as net.AddressInfo
      resolve({ port, seen, close: () => new Promise((r) => server.close(() => r())) })
    })
  })
}

function errorResponse(message: string): Buffer {
  const fields = Buffer.from(`SFATAL\0C28000\0M${message}\0\0`)
  const header = Buffer.alloc(5)
  header.write('E')
  header.writeInt32BE(fields.length + 4, 1)
  return Buffer.concat([header, fields])
}

let fake: Awaited<ReturnType<typeof startFakeServer>>
beforeEach(async () => {
  fake = await startFakeServer()
})
afterEach(async () => {
  await fake.close()
})

// 127.0.0.2 is a loopback address that the app does not treat as "local", so TLS is tried first.
const url = (port: number, query = '') => `postgresql://postgres:pw@127.0.0.2:${port}/postgres${query}`

describe('runPg TLS handling', () => {
  it('retries without TLS when the server has none, and reaches the real error', async () => {
    await expect(runPg(url(fake.port), 'select 1', true)).rejects.toThrow(/authentication not configured/)
    expect(fake.seen).toEqual(['ssl-request', 'startup'])
  })

  it('goes straight to a plain connection when the URL says sslmode=disable', async () => {
    await expect(runPg(url(fake.port, '?sslmode=disable'), 'select 1', true)).rejects.toThrow(/authentication not configured/)
    expect(fake.seen).toEqual(['startup'])
  })

  it('does not hide other connection failures behind the fallback', async () => {
    await fake.close()
    await expect(runPg(url(fake.port), 'select 1', true)).rejects.toThrow()
    // Re-open so afterEach can close cleanly.
    fake = await startFakeServer()
  })
})
