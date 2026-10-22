import type { ApiKeyInfo, PoolerConfig } from '../../core/dbUrl'

const BASE_URL = process.env.SUPABASE_MANAGEMENT_API_URL ?? 'https://api.supabase.com'
const MAX_RETRIES = 3

export interface RemoteOrganization {
  id: string
  slug: string
  name: string
}

export interface RemoteProject {
  id: string
  ref: string
  name: string
  organization_id: string
  organization_slug?: string
  region: string
  status: string
  created_at?: string
}

export type PoolerEntry = PoolerConfig & { database_type?: string }

export interface RemoteSecret {
  name: string
  /** SHA-256 digest of the value; the API never returns the value itself. */
  value: string
  updated_at?: string
}

export interface RemoteFunction {
  id: string
  slug: string
  name: string
  status: string
  version: number
  created_at?: number
  updated_at?: number
  verify_jwt?: boolean
  entrypoint_path?: string
}

export interface RemoteMigration {
  version: string
  name?: string
}

export interface CreateProjectRequest {
  name: string
  organization_slug: string
  db_pass: string
  region: string
  plan?: 'free' | 'pro'
}

export type ProjectConfigKind = 'auth' | 'storage' | 'postgres' | 'pooler' | 'realtime'

export class ManagementApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ManagementApiError'
  }
}

export interface ManagementApiOptions {
  token: string
  fetchImpl?: typeof fetch
  baseUrl?: string
  sleep?: (ms: number) => Promise<void>
}

/**
 * Thin client for the Supabase Management API. It only ever runs in the main process: the
 * personal access token must never be handed to the renderer.
 */
export class ManagementApi {
  private readonly token: string
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: ManagementApiOptions) {
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? fetch
    this.baseUrl = options.baseUrl ?? BASE_URL
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  listOrganizations(): Promise<RemoteOrganization[]> {
    return this.request('GET', '/v1/organizations')
  }

  listProjects(): Promise<RemoteProject[]> {
    return this.request('GET', '/v1/projects')
  }

  /** `reveal` makes the API return the secret key values instead of masked ones. */
  getApiKeys(ref: string, reveal = false): Promise<ApiKeyInfo[]> {
    return this.request('GET', `/v1/projects/${enc(ref)}/api-keys?reveal=${reveal}`)
  }

  createProject(body: CreateProjectRequest): Promise<RemoteProject> {
    return this.request('POST', '/v1/projects', body)
  }

  deleteProject(ref: string): Promise<void> {
    return this.request('DELETE', `/v1/projects/${enc(ref)}`)
  }

  listSecrets(ref: string): Promise<RemoteSecret[]> {
    return this.request('GET', `/v1/projects/${enc(ref)}/secrets`)
  }

  createSecrets(ref: string, secrets: { name: string; value: string }[]): Promise<void> {
    return this.request('POST', `/v1/projects/${enc(ref)}/secrets`, secrets)
  }

  deleteSecrets(ref: string, names: string[]): Promise<void> {
    return this.request('DELETE', `/v1/projects/${enc(ref)}/secrets`, names)
  }

  listFunctions(ref: string): Promise<RemoteFunction[]> {
    return this.request('GET', `/v1/projects/${enc(ref)}/functions`)
  }

  /** Raw function body as served by the API (an eszip/multipart bundle), for archiving. */
  getFunctionBody(ref: string, slug: string): Promise<Buffer> {
    return this.requestRaw('GET', `/v1/projects/${enc(ref)}/functions/${enc(slug)}/body`)
  }

  listMigrations(ref: string): Promise<RemoteMigration[]> {
    return this.request('GET', `/v1/projects/${enc(ref)}/database/migrations`)
  }

  getProjectConfig(ref: string, kind: ProjectConfigKind): Promise<unknown> {
    const path = kind === 'pooler' || kind === 'postgres' ? `database/${kind}` : kind
    return this.request('GET', `/v1/projects/${enc(ref)}/config/${path}`)
  }

  /** Logs Explorer query; the API only accepts windows of up to 24 hours. */
  queryLogs(
    ref: string,
    options: { sql: string; start: string; end: string }
  ): Promise<{ result?: unknown[]; error?: unknown }> {
    const query = new URLSearchParams({
      sql: options.sql,
      iso_timestamp_start: options.start,
      iso_timestamp_end: options.end,
    })
    return this.request('GET', `/v1/projects/${enc(ref)}/analytics/endpoints/logs?${query}`)
  }

  getPoolerConfig(ref: string): Promise<PoolerEntry[]> {
    return this.request('GET', `/v1/projects/${enc(ref)}/config/database/pooler`)
  }

  runQuery(ref: string, query: string, options: { readOnly?: boolean } = {}): Promise<unknown[]> {
    const path = options.readOnly
      ? `/v1/projects/${enc(ref)}/database/query/read-only`
      : `/v1/projects/${enc(ref)}/database/query`
    return this.request('POST', path, { query })
  }

  pauseProject(ref: string): Promise<void> {
    return this.request('POST', `/v1/projects/${enc(ref)}/pause`)
  }

  restoreProject(ref: string): Promise<void> {
    return this.request('POST', `/v1/projects/${enc(ref)}/restore`, {})
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.send(method, path, body)
    const text = await response.text()
    if (!response.ok) throw new ManagementApiError(describeError(response.status, text), response.status)
    return (text ? JSON.parse(text) : undefined) as T
  }

  private async requestRaw(method: string, path: string): Promise<Buffer> {
    const response = await this.send(method, path)
    if (!response.ok) throw new ManagementApiError(describeError(response.status, await response.text()), response.status)
    return Buffer.from(await response.arrayBuffer())
  }

  /** Sends the request, waiting out 429 responses. */
  private async send(method: string, path: string, body?: unknown): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })

      if (response.status === 429 && attempt < MAX_RETRIES) {
        // The API allows ~120 requests/min per token; honour Retry-After, else back off.
        const retryAfter = Number(response.headers.get('retry-after'))
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt
        await this.sleep(waitMs)
        continue
      }
      return response
    }
  }
}

function enc(ref: string): string {
  return encodeURIComponent(ref)
}

function describeError(status: number, text: string): string {
  if (status === 401) return 'The access token was rejected (401). Check that it is a valid, non-revoked personal access token.'
  if (status === 403) return 'The access token does not have permission for this action (403).'
  if (status === 429) return 'Rate limit exceeded (429). Try again in a minute.'
  try {
    const message = JSON.parse(text)?.message
    if (message) return `Supabase API error ${status}: ${message}`
  } catch {
    // body was not JSON
  }
  return `Supabase API error ${status}${text ? `: ${text.slice(0, 200)}` : ''}`
}
