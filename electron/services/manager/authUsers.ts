import type { User } from '@supabase/supabase-js'
import { appendAudit } from '../audit'
import { adminClient, projectContext } from './context'
import type { AuthUser, AuthUsersPage } from '../../shared/managerApi'

/** "Banned forever" in GoTrue is a very long duration (about 100 years). */
const BAN_FOREVER = '876000h'

export function toAuthUser(u: User): AuthUser {
  const providers = (u.app_metadata?.providers as string[] | undefined) ?? (u.app_metadata?.provider ? [String(u.app_metadata.provider)] : [])
  return {
    id: u.id,
    email: u.email ?? undefined,
    phone: u.phone || undefined,
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? undefined,
    confirmedAt: u.email_confirmed_at ?? u.phone_confirmed_at ?? undefined,
    bannedUntil: (u as User & { banned_until?: string }).banned_until ?? undefined,
    providers,
    isAnonymous: !!u.is_anonymous,
  }
}

export async function listUsers(connectionId: string, page: number, perPage: number): Promise<AuthUsersPage> {
  const { connection } = projectContext(connectionId)
  const { data, error } = await adminClient(connection).auth.admin.listUsers({ page, perPage })
  if (error) throw new Error(error.message)
  const users = data.users.map(toAuthUser)
  const { total, nextPage } = data as { total?: number; nextPage?: number | null }
  // GoTrue reports the next page through its Link header; fall back to the page size when it is absent.
  const hasMore = nextPage != null ? true : total && total > 0 ? page * perPage < total : users.length === perPage
  return { users, page, perPage, total: total && total > 0 ? total : undefined, hasMore }
}

export async function createUser(connectionId: string, email: string, password: string, confirmEmail: boolean): Promise<AuthUser> {
  const { connection } = projectContext(connectionId)
  const { data, error } = await adminClient(connection).auth.admin.createUser({
    email,
    password,
    email_confirm: confirmEmail,
  })
  if (error) throw new Error(error.message)
  appendAudit({ action: 'auth.createUser', project: connection.name, detail: email })
  return toAuthUser(data.user)
}

export async function setBanned(connectionId: string, userId: string, banned: boolean): Promise<void> {
  const { connection } = projectContext(connectionId)
  const { error } = await adminClient(connection).auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_FOREVER : 'none',
  })
  if (error) throw new Error(error.message)
  appendAudit({ action: banned ? 'auth.banUser' : 'auth.unbanUser', project: connection.name, detail: userId })
}

export async function deleteUser(connectionId: string, userId: string): Promise<void> {
  const { connection } = projectContext(connectionId)
  const { error } = await adminClient(connection).auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)
  appendAudit({ action: 'auth.deleteUser', project: connection.name, detail: userId })
}
