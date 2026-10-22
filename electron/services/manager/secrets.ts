import { appendAudit } from '../audit'
import { projectContext, requireAccount } from './context'
import type { ApiKeyView, SecretView } from '../../shared/managerApi'

export async function listSecrets(connectionId: string): Promise<SecretView[]> {
  const ctx = projectContext(connectionId)
  const { api, ref } = requireAccount(ctx, 'Edge Function secrets')
  // The API returns only digests; we never show or keep them.
  return (await api.listSecrets(ref))
    .map((s) => ({ name: s.name, updatedAt: s.updated_at }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function setSecret(connectionId: string, name: string, value: string): Promise<void> {
  const ctx = projectContext(connectionId)
  const { api, ref } = requireAccount(ctx, 'Edge Function secrets')
  await api.createSecrets(ref, [{ name, value }])
  appendAudit({ action: 'secrets.set', project: ctx.connection.name, detail: name })
}

export async function deleteSecret(connectionId: string, name: string): Promise<void> {
  const ctx = projectContext(connectionId)
  const { api, ref } = requireAccount(ctx, 'Edge Function secrets')
  await api.deleteSecrets(ref, [name])
  appendAudit({ action: 'secrets.delete', project: ctx.connection.name, detail: name })
}

export async function listApiKeys(connectionId: string): Promise<ApiKeyView[]> {
  const ctx = projectContext(connectionId)
  const { api, ref } = requireAccount(ctx, 'API keys')
  return (await api.getApiKeys(ref, false)).map((k, i) => ({
    id: k.id ?? String(i),
    name: k.name,
    type: k.type ?? 'legacy',
    masked: k.api_key ?? '••••••••',
  }))
}

/** Full key value, fetched only when the user asks for it (copy / reveal). */
export async function revealApiKey(connectionId: string, id: string): Promise<{ key: string }> {
  const ctx = projectContext(connectionId)
  const { api, ref } = requireAccount(ctx, 'API keys')
  const keys = await api.getApiKeys(ref, true)
  const match = keys.find((k, i) => (k.id ?? String(i)) === id)
  if (!match?.api_key) throw new Error('The key could not be revealed.')
  appendAudit({ action: 'apiKeys.reveal', project: ctx.connection.name, detail: match.name })
  return { key: match.api_key }
}
