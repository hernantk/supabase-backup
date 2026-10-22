import { useEffect } from 'react'
import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import type { ManagerApi, ManagerMethod } from '../../electron/shared/managerApi'

/** Electron wraps main-process errors as "Error invoking remote method 'x': Error: message"; show just the message. */
export function cleanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '').replace(/^Error: /, '')
}

/** Typed call into the main process. */
export async function call<K extends ManagerMethod>(method: K, payload: ManagerApi[K]['in']): Promise<ManagerApi[K]['out']> {
  try {
    return await window.electronAPI.manager(method, payload)
  } catch (err) {
    throw new Error(cleanError(err))
  }
}

/** Query over a manager method; the key is the method plus its payload so each project caches separately. */
export function useManagerQuery<K extends ManagerMethod>(
  method: K,
  payload: ManagerApi[K]['in'],
  options: Omit<UseQueryOptions<ManagerApi[K]['out'], Error>, 'queryKey' | 'queryFn'> = {}
) {
  return useQuery<ManagerApi[K]['out'], Error>({
    queryKey: [method, payload],
    queryFn: () => call(method, payload),
    ...options,
  })
}

/** Refetches the project list whenever the main process says something changed (e.g. provisioning finished). */
export function useManagerChangeSync(): void {
  const client = useQueryClient()
  useEffect(() => window.electronAPI.onManagerChanged(() => client.invalidateQueries({ queryKey: ['projects.list'] })), [client])
}
