import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  // Backup operations
  runBackup: (options: BackupOptions) => Promise<BackupResult>
  cancelBackup: () => Promise<void>

  // Config
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
  testConnection: (config: SupabaseConfig) => Promise<{ success: boolean; message: string }>

  // Backup history
  getBackupHistory: () => Promise<BackupRecord[]>
  deleteBackupRecord: (id: string) => Promise<void>

  // Scheduler
  getSchedulerStatus: () => Promise<SchedulerStatus>
  startScheduler: () => Promise<void>
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

  // Window controls
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void

  // Events
  onBackupProgress: (callback: (progress: BackupProgress) => void) => () => void
  onBackupComplete: (callback: (result: BackupResult) => void) => () => void
  onPgDumpDownloadProgress: (callback: (progress: PgDumpDownloadProgress) => void) => () => void
}

export interface BackupOptions {
  include: ('database' | 'storage')[]
  destinations: string[]
  compress: boolean
  encrypt: boolean
}

export interface BackupResult {
  id: string
  success: boolean
  timestamp: string
  duration: number
  size: number
  destinations: string[]
  error?: string
}

export interface BackupRecord {
  id: string
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

export interface SupabaseConfig {
  url: string
  serviceRoleKey: string
  dbUrl: string
}

export interface DestinationConfig {
  local: {
    enabled: boolean
    path: string
  }
  s3: {
    enabled: boolean
    bucket: string
    region: string
    endpoint: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle: boolean
  }
  gcs: {
    enabled: boolean
    bucket: string
    credentialsFile: string
  }
  azure: {
    enabled: boolean
    container: string
    connectionString: string
  }
}

export interface AppConfig {
  supabase: SupabaseConfig
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
  destinations: DestinationConfig
  schedule: {
    enabled: boolean
    cron: string
  }
  notifications: {
    enabled: boolean
    webhookUrl: string
    onSuccess: boolean
    onFailure: boolean
  }
}

export interface SchedulerStatus {
  running: boolean
  nextRun: string | null
  lastRun: string | null
  cron: string
}

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
  startScheduler: () => ipcRenderer.invoke('scheduler:start'),
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
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
