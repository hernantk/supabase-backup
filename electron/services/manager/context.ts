import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import { loadConfig } from '../config'
import { managementApiForAccount } from '../supabase/accounts'
import type { ManagementApi } from '../supabase/managementApi'
import type { ConnectionConfig } from '../../preload'

export interface ProjectContext {
  connection: ConnectionConfig
  /** Management API client and project ref, when the project belongs to an account. */
  api?: ManagementApi
  ref?: string
}

export function projectContext(connectionId: string): ProjectContext {
  const connection = loadConfig().connections.find((c) => c.id === connectionId)
  if (!connection) throw new Error('This project no longer exists. Refresh the list.')
  const api = managementApiForAccount(connection.accountId)
  return { connection, api, ref: connection.projectRef }
}

/** For features that only exist through the Management API. */
export function requireAccount(ctx: ProjectContext, what: string): { api: ManagementApi; ref: string } {
  if (!ctx.api || !ctx.ref) {
    throw new Error(`${what} needs the project to be connected through an account (personal access token).`)
  }
  return { api: ctx.api, ref: ctx.ref }
}

/** supabase-js client with the service-role key; used for Auth admin and Storage. */
export function adminClient(connection: ConnectionConfig): SupabaseClient {
  const { url, serviceRoleKey } = connection.supabase
  if (!url || !serviceRoleKey) {
    throw new Error('This project has no URL or service-role key. Add them in Settings, or import it from an account.')
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Electron's bundled Node has no native WebSocket; realtime-js needs the 'ws' package.
    realtime: { transport: ws as any },
  })
}
