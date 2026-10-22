import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AppConfig, BackupRecord, ConnectionConfig } from '../../electron/preload'

export function useConfig() {
  return useQuery<AppConfig, Error>({ queryKey: ['config'], queryFn: () => window.electronAPI.getConfig(), staleTime: 5_000 })
}

/** Saves the whole config and refreshes everything that derives from it. */
export function useSaveConfig() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (config: AppConfig) => window.electronAPI.saveConfig(config),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['config'] })
      await client.invalidateQueries({ queryKey: ['projects.list'] })
      await client.invalidateQueries({ queryKey: ['scheduler'] })
    },
  })
}

/** Updates one connection with a partial change and saves the config. */
export function useUpdateConnection() {
  const { data: config } = useConfig()
  const save = useSaveConfig()
  return {
    ...save,
    update: (id: string, patch: (c: ConnectionConfig) => ConnectionConfig) => {
      if (!config) return Promise.reject(new Error('Config not loaded'))
      return save.mutateAsync({ ...config, connections: config.connections.map((c) => (c.id === id ? patch(c) : c)) })
    },
  }
}

/** Backup history, refreshed whenever a backup finishes. */
export function useHistory() {
  const client = useQueryClient()
  useEffect(() => window.electronAPI.onBackupComplete(() => client.invalidateQueries({ queryKey: ['history'] })), [client])
  return useQuery<BackupRecord[], Error>({ queryKey: ['history'], queryFn: () => window.electronAPI.getBackupHistory() })
}
