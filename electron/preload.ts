import { contextBridge, ipcRenderer } from 'electron'

// ─── Connection config ────────────────────────────────────────────────────────

export interface ConnectionConfig {
  id: string
  name: string
  supabase: {
    url: string
    serviceRoleKey: string
    dbUrl: string
  }
  backup: {
    include: ('database' | 'storage')[]
    compress: boolean
    encrypt: boolean
    encryptionPassword: string
    retention: {
      enabled: boolean
      keepLast: number
    }
  }
  schedule: {
    enabled: boolean
    cron: string
  }
}

// ─── App config ───────────────────────────────────────────────────────────────

export interface DestinationConfig {
  local: { enabled: boolean; path: string }
  s3: {
    enabled: boolean
    bucket: string
    region: string
    endpoint: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle: boolean
  }
  gcs: { enabled: boolean; bucket: string; credentialsFile: string }
  azure: { enabled: boolean; container: string; connectionString: string }
}

export interface AppConfig {
  connections: ConnectionConfig[]
  destinations: DestinationConfig
  notifications: {
    enabled: boolean
    webhookUrl: string
    onSuccess: boolean
    onFailure: boolean
  }
}

// ─── Backup types ─────────────────────────────────────────────────────────────

export interface BackupOptions {
  connectionId: string
  include: ('database' | 'storage')[]
  destinations: string[]
  compress: boolean
  encrypt: boolean
}

export interface BackupResult {
  id: string
  connectionId: string
  connectionName: string
  success: boolean
  timestamp: string
  duration: number
  size: number
  destinations: string[]
  /** Absolute path to the file saved in the local destination, if local was enabled. */
  localPath?: string
  error?: string
}

export interface BackupRecord {
  id: string
  connectionId?: string
  connectionName?: string
  timestamp: string
  duration: number
  size: number
  type: ('database' | 'storage')[]
  destinations: string[]
  status: 'success' | 'failed' | 'running'
  error?: string
}

export interface BackupProgress {
  stage: 'database' | 'storage' | 'compress' | 'encrypt' | 'upload'
  progress: number
  message: string
  currentFile?: string
}

// ─── Supabase config (used for standalone connection tests) ───────────────────

export interface SupabaseConfig {
  url: string
  serviceRoleKey: string
  dbUrl: string
}

// ─── Scheduler types ──────────────────────────────────────────────────────────

export interface ConnectionSchedulerStatus {
  connectionId: string
  connectionName: string
  running: boolean
  cron: string
  nextRun: string | null
  lastRun: string | null
}

export interface SchedulerStatus {
  activeCount: number
  connections: ConnectionSchedulerStatus[]
}

// ─── Restore types ────────────────────────────────────────────────────────────

export interface RestoreProgress {
  stage: 'preparing' | 'restoring' | 'done'
  progress: number
  message: string
}

// ─── Log types ────────────────────────────────────────────────────────────────

export interface LogQuery {
  limit: number
  offset: number
  level?: string
  startDate?: string
  endDate?: string
}

export interface LogEntry {
  timestamp: string
  level: string
  message: string
  meta?: Record<string, any>
}

// ─── pg_dump types ────────────────────────────────────────────────────────────

export interface PgDumpInfo {
  found: boolean
  path: string | null
  version: string | null
  source: 'path' | 'resources' | 'custom' | null
}

export interface PgDumpDownloadProgress {
  phase: 'downloading' | 'extracting' | 'done' | 'error'
  progress: number
  message: string
  bytesReceived?: number
  bytesTotal?: number
}

export interface PgDumpWingetProgress {
  phase: 'running' | 'done' | 'error'
  message: string
}

// ─── ElectronAPI ──────────────────────────────────────────────────────────────

export interface ElectronAPI {
  // Backup
  runBackup: (options: BackupOptions) => Promise<BackupResult>
  cancelBackup: () => Promise<void>

  // Config
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
  testConnection: (config: SupabaseConfig) => Promise<{ success: boolean; message: string }>

  // History
  getBackupHistory: () => Promise<BackupRecord[]>
  deleteBackupRecord: (id: string) => Promise<void>

  // Scheduler
  getSchedulerStatus: () => Promise<SchedulerStatus>
  syncScheduler: () => Promise<void>
  stopScheduler: () => Promise<void>

  // Logs
  getLogs: (options: LogQuery) => Promise<LogEntry[]>

  // Destinations
  testDestination: (type: string, config: any) => Promise<{ success: boolean; message: string }>
  browseFolder: () => Promise<string | null>
  browseFile: () => Promise<string | null>

  // pg_dump installer
  detectPgDump: () => Promise<PgDumpInfo>
  downloadPgDump: () => Promise<void>
  abortPgDumpDownload: () => Promise<void>
  setPgDumpPath: (path: string) => Promise<void>
  getLinuxInstallCommands: () => Promise<string[]>
  installPgDumpViaWinget: () => Promise<void>

  // Restore
  restoreDatabase: (connectionId: string, filePath: string) => Promise<void>
  cancelRestore: () => Promise<void>

  // Shell
  openFolder: (folderPath: string) => Promise<void>

  // Window
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void

  // Events
  onBackupProgress: (callback: (progress: BackupProgress) => void) => () => void
  onBackupComplete: (callback: (result: BackupResult) => void) => () => void
  onPgDumpDownloadProgress: (callback: (progress: PgDumpDownloadProgress) => void) => () => void
  onPgDumpWingetProgress: (callback: (progress: PgDumpWingetProgress) => void) => () => void
  onRestoreProgress: (callback: (progress: RestoreProgress) => void) => () => void
}

const electronAPI: ElectronAPI = {
  // Backup
  runBackup: (options) => ipcRenderer.invoke('backup:run', options),
  cancelBackup: () => ipcRenderer.invoke('backup:cancel'),

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  testConnection: (config) => ipcRenderer.invoke('config:test-connection', config),

  // History
  getBackupHistory: () => ipcRenderer.invoke('backup:history'),
  deleteBackupRecord: (id) => ipcRenderer.invoke('backup:delete-record', id),

  // Scheduler
  getSchedulerStatus: () => ipcRenderer.invoke('scheduler:status'),
  syncScheduler: () => ipcRenderer.invoke('scheduler:sync'),
  stopScheduler: () => ipcRenderer.invoke('scheduler:stop'),

  // Logs
  getLogs: (options) => ipcRenderer.invoke('logs:get', options),

  // Destinations
  testDestination: (type, config) => ipcRenderer.invoke('destination:test', type, config),
  browseFolder: () => ipcRenderer.invoke('dialog:browse-folder'),
  browseFile: () => ipcRenderer.invoke('dialog:browse-file'),

  // pg_dump installer
  detectPgDump: () => ipcRenderer.invoke('pgdump:detect'),
  downloadPgDump: () => ipcRenderer.invoke('pgdump:download'),
  abortPgDumpDownload: () => ipcRenderer.invoke('pgdump:abort'),
  setPgDumpPath: (path) => ipcRenderer.invoke('pgdump:set-path', path),
  getLinuxInstallCommands: () => ipcRenderer.invoke('pgdump:linux-commands'),
  installPgDumpViaWinget: () => ipcRenderer.invoke('pgdump:install-winget'),

  // Restore
  restoreDatabase: (connectionId, filePath) => ipcRenderer.invoke('restore:run', connectionId, filePath),
  cancelRestore: () => ipcRenderer.invoke('restore:cancel'),

  // Shell
  openFolder: (folderPath) => ipcRenderer.invoke('shell:open-folder', folderPath),

  // Window
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Events
  onBackupProgress: (callback) => {
    const handler = (_event: any, progress: BackupProgress) => callback(progress)
    ipcRenderer.on('backup:progress', handler)
    return () => ipcRenderer.removeListener('backup:progress', handler)
  },
  onBackupComplete: (callback) => {
    const handler = (_event: any, result: BackupResult) => callback(result)
    ipcRenderer.on('backup:complete', handler)
    return () => ipcRenderer.removeListener('backup:complete', handler)
  },
  onPgDumpDownloadProgress: (callback) => {
    const handler = (_event: any, progress: PgDumpDownloadProgress) => callback(progress)
    ipcRenderer.on('pgdump:download-progress', handler)
    return () => ipcRenderer.removeListener('pgdump:download-progress', handler)
  },
  onPgDumpWingetProgress: (callback) => {
    const handler = (_event: any, progress: PgDumpWingetProgress) => callback(progress)
    ipcRenderer.on('pgdump:winget-progress', handler)
    return () => ipcRenderer.removeListener('pgdump:winget-progress', handler)
  },
  onRestoreProgress: (callback) => {
    const handler = (_event: any, progress: RestoreProgress) => callback(progress)
    ipcRenderer.on('restore:progress', handler)
    return () => ipcRenderer.removeListener('restore:progress', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
