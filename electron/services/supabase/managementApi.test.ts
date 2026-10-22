import { describe, it, expect } from 'vitest'
import { ManagementApi, ManagementApiError } from './managementApi'

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })
}

function apiWith(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const sleeps: number[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return responses.shift()!
  }) as unknown as typeof fetch
  const api = new ManagementApi({
    token: 'sbp_test',
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
  })
  return { api, calls, sleeps }
}

describe('ManagementApi', () => {
  it('sends the bearer token and parses the project list', async () => {
    const { api, calls } = apiWith([respond(200, [{ ref: 'abc', name: 'Prod' }])])
    const projects = await api.listProjects()

    expect(projects).toEqual([{ ref: 'abc', name: 'Prod' }])
    expect(calls[0].url).toBe('https://api.supabase.com/v1/projects')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sbp_test')
  })

  it('asks for revealed api keys', async () => {
    const { api, calls } = apiWith([respond(200, [])])
    await api.getApiKeys('abc')
    expect(calls[0].url).toBe('https://api.supabase.com/v1/projects/abc/api-keys?reveal=true')
  })

  it('uses the read-only endpoint for read-only queries and posts the SQL as JSON', async () => {
    const { api, calls } = apiWith([respond(201, [{ one: 1 }]), respond(201, [])])
    await api.runQuery('abc', 'select 1', { readOnly: true })
    await api.runQuery('abc', 'select 1')

    expect(calls[0].url).toBe('https://api.supabase.com/v1/projects/abc/database/query/read-only')
    expect(calls[1].url).toBe('https://api.supabase.com/v1/projects/abc/database/query')
    expect(calls[0].init.body).toBe(JSON.stringify({ query: 'select 1' }))
  })

  it('retries on 429 honouring Retry-After', async () => {
    const { api, calls, sleeps } = apiWith([
      respond(429, '', { 'retry-after': '3' }),
      respond(429, ''),
      respond(200, []),
    ])
    await api.listOrganizations()

    expect(calls).toHaveLength(3)
    expect(sleeps).toEqual([3000, 2000])
  })

  it('gives up after repeated 429s', async () => {
    const { api } = apiWith([respond(429, ''), respond(429, ''), respond(429, ''), respond(429, '')])
    await expect(api.listProjects()).rejects.toMatchObject({ status: 429 })
  })

  it('turns a 401 into an actionable error', async () => {
    const { api } = apiWith([respond(401, { message: 'Unauthorized' })])
    const err = await api.listProjects().catch((e) => e)

    expect(err).toBeInstanceOf(ManagementApiError)
    expect(err.status).toBe(401)
    expect(err.message).toContain('access token was rejected')
  })

  it('surfaces the API message for other failures and tolerates empty success bodies', async () => {
    const { api } = apiWith([respond(400, { message: 'bad sql' }), respond(200, '')])
    await expect(api.runQuery('abc', 'x')).rejects.toThrow('bad sql')
    await expect(api.pauseProject('abc')).resolves.toBeUndefined()
  })
})
