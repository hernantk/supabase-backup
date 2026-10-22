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

  it('asks for masked api keys unless told to reveal them', async () => {
    const { api, calls } = apiWith([respond(200, []), respond(200, [])])
    await api.getApiKeys('abc')
    await api.getApiKeys('abc', true)
    expect(calls[0].url).toBe('https://api.supabase.com/v1/projects/abc/api-keys?reveal=false')
    expect(calls[1].url).toBe('https://api.supabase.com/v1/projects/abc/api-keys?reveal=true')
  })

  it('sends secrets and deletions with the right verbs and bodies', async () => {
    const { api, calls } = apiWith([respond(201, ''), respond(200, '')])
    await api.createSecrets('abc', [{ name: 'A', value: '1' }])
    await api.deleteSecrets('abc', ['A'])
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).toBe(JSON.stringify([{ name: 'A', value: '1' }]))
    expect(calls[1].init.method).toBe('DELETE')
    expect(calls[1].init.body).toBe(JSON.stringify(['A']))
  })

  it('creates and deletes projects', async () => {
    const { api, calls } = apiWith([respond(201, { ref: 'new', name: 'N' }), respond(200, '')])
    const created = await api.createProject({ name: 'N', organization_slug: 'org', db_pass: 'pw', region: 'sa-east-1' })
    await api.deleteProject('new')
    expect(created.ref).toBe('new')
    expect(calls[0].url).toBe('https://api.supabase.com/v1/projects')
    expect(calls[1].init.method).toBe('DELETE')
    expect(calls[1].url).toBe('https://api.supabase.com/v1/projects/new')
  })

  it('downloads a function body as raw bytes', async () => {
    const { api } = apiWith([new Response(new Uint8Array([1, 2, 3]), { status: 200 })])
    const body = await api.getFunctionBody('abc', 'hello')
    expect([...body]).toEqual([1, 2, 3])
  })

  it('queries logs with the time window', async () => {
    const { api, calls } = apiWith([respond(200, { result: [] })])
    await api.queryLogs('abc', { sql: 'select 1', start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z' })
    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/v1/projects/abc/analytics/endpoints/logs')
    expect(url.searchParams.get('sql')).toBe('select 1')
    expect(url.searchParams.get('iso_timestamp_start')).toBe('2026-01-01T00:00:00Z')
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
