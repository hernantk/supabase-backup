import fs from 'fs'
import path from 'path'
import type { ManagementApi, ProjectConfigKind } from '../supabase/managementApi'

/** The slice of the Management API client these backups need (lets tests pass a fake). */
export type MetaApi = Pick<
  ManagementApi,
  'listFunctions' | 'getFunctionBody' | 'getProjectConfig' | 'listSecrets' | 'listMigrations' | 'listProjects'
>

const CONFIG_KINDS: ProjectConfigKind[] = ['auth', 'storage', 'postgres', 'pooler', 'realtime']

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

function safeName(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/**
 * Archives the Edge Functions: the list as JSON plus each function's source bundle exactly as the API
 * serves it. One broken function never fails the backup; it is listed in `_errors.json`.
 */
export async function backupFunctions(
  api: MetaApi,
  ref: string,
  outDir: string,
  onProgress?: (message: string, progress: number) => void,
  signal?: AbortSignal
): Promise<{ functions: number; errors: number }> {
  const dir = path.join(outDir, 'functions')
  const functions = await api.listFunctions(ref)
  writeJson(path.join(dir, 'functions.json'), functions)

  const errors: { slug: string; error: string }[] = []
  let done = 0
  for (const fn of functions) {
    if (signal?.aborted) throw new Error('Backup cancelled by user')
    onProgress?.(`Downloading function ${fn.slug}`, Math.round((done / Math.max(functions.length, 1)) * 100))
    try {
      fs.writeFileSync(path.join(dir, `${safeName(fn.slug)}.bundle`), await api.getFunctionBody(ref, fn.slug))
    } catch (err: any) {
      errors.push({ slug: fn.slug, error: err.message })
    }
    done++
  }
  if (errors.length > 0) writeJson(path.join(dir, '_errors.json'), errors)
  onProgress?.(`Edge Functions saved (${functions.length})`, 100)
  return { functions: functions.length, errors: errors.length }
}

/**
 * Archives the project's settings as JSON: auth, storage, postgres, pooler and realtime config, the
 * names (never values) of Edge Function secrets, and the applied migrations. Items the account cannot
 * read are recorded in `_errors.json` instead of failing the backup.
 */
export async function backupConfig(
  api: MetaApi,
  ref: string,
  outDir: string,
  info: { name: string; region?: string; status?: string },
  onProgress?: (message: string, progress: number) => void,
  signal?: AbortSignal
): Promise<{ files: number; errors: number }> {
  const dir = path.join(outDir, 'config')
  const errors: { item: string; error: string }[] = []
  let files = 0

  const save = async (name: string, fetcher: () => Promise<unknown>) => {
    if (signal?.aborted) throw new Error('Backup cancelled by user')
    onProgress?.(`Reading ${name}`, Math.round((files / (CONFIG_KINDS.length + 3)) * 100))
    try {
      writeJson(path.join(dir, `${name}.json`), await fetcher())
      files++
    } catch (err: any) {
      errors.push({ item: name, error: err.message })
    }
  }

  writeJson(path.join(dir, 'project.json'), { ref, ...info, savedAt: new Date().toISOString() })
  files++
  for (const kind of CONFIG_KINDS) await save(kind, () => api.getProjectConfig(ref, kind))
  await save('secret-names', async () => (await api.listSecrets(ref)).map((s) => ({ name: s.name, updated_at: s.updated_at })))
  await save('migrations', () => api.listMigrations(ref))

  if (errors.length > 0) writeJson(path.join(dir, '_errors.json'), errors)
  onProgress?.('Project configuration saved', 100)
  return { files, errors: errors.length }
}
