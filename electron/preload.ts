import { contextBridge, ipcRenderer } from 'electron'
import type { JobInfo, BatchSummary, QueueEvent } from './core/jobQueue'
import type { ManagerApi, ManagerMethod } from './shared/managerApi'
import type { LanguagePreference } from './shared/languages'

export type { JobInfo, BatchSummary, QueueEvent }

// ─── Connection config ────────────────────────────────────────────────────────

/** What a backup can contain. Functions and config need the project to belong to an account. */
export type BackupInclude = 'database' | 'storage' | 'functions' | 'config'

export interface ConnectionConfig {
  id: string
  name: string
  /** Set when the project was imported from a Supabase account (Management API). */
  accountId?: string
  projectRef?: string
  /** Production safety: writes and schema changes from the Manager need an explicit confirmation. */
  protected?: boolean
  supabase: {
    url: string
    serviceRoleKey: string
    dbUrl: string
  }
  backup: {
    include: BackupInclude[]
    compress: boolean
    encrypt: boolean
    encryptionPassword: string
    retention: {
      enabled: boolean
      keepLast: number
      /** Layered policy: also keep the newest backup of each of the last N days, weeks and months. */
      keepDaily?: number
      keepWeekly?: number
      keepMonthly?: number
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

export interface AppSettings {
  /** Backups allowed to run at the same time across all projects. */
  maxConcurrentBackups: number
  /** Closing the window keeps the app (and its schedules) running in the tray. */
  closeToTray: boolean
  startWithSystem: boolean
  /** Run a scheduled backup that was missed because the PC was off or asleep. */
  catchUpMissed: boolean
  appearance: 'system' | 'light' | 'dark'
  language: LanguagePreference
  /** Look for a new release when the app starts (never installs without asking). */
  autoUpdate: boolean
}

export interface AppConfig {
  connections: ConnectionConfig[]
  settings: AppSettings
  destinations: DestinationConfig
  notifications: {
    enabled: boolean
    webhookUrl: string
    onSuccess: boolean
    onFailure: boolean
    /** System notification when a backup or batch finishes. */
    native: boolean
  }
}

// ─── Backup types ─────────────────────────────────────────────────────────────

export interface BackupOptions {
  connectionId: string
  include: BackupInclude[]
  destinations: string[]
  compress: boolean
  encrypt: boolean
}

export interface BackupResult {
  id: string
  jobId?: string
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
  type: BackupInclude[]
  destinations: string[]
  /** Absolute path of the file in the local destination, when one was used. */
  localPath?: string
  status: 'success' | 'failed' | 'running'
  error?: string
}

export interface BackupProgress {
  stage: 'database' | 'storage' | 'functions' | 'config' | 'compress' | 'encrypt' | 'upload'
  progress: number
  message: string
  currentFile?: string
  /** Set by the backup service so the UI can tell concurrent runs apart. */
  jobId?: string
  connectionId?: string
  connectionName?: string
}

export interface BatchStartResult {
  batchId: string
  jobs: { jobId: string; connectionId: string }[]
  /** Connection ids that were requested but do not exist. */
  skipped: string[]
}

// ─── Accounts (Supabase Management API) ───────────────────────────────────────

/** What the renderer sees of an account: never the token. */
export interface AccountSummary {
  id: string
  name: string
  createdAt: string
}

export interface AccountProject {
  ref: string
  name: string
  region: string
  status: string
  organizationId: string
  /** Id of the project (connection) already imported from this account, if any. */
  importedConnectionId?: string
}

export interface ImportProjectRequest {
  ref: string
  /** Database password. Optional: it can be set later, but backups need it. */
  dbPassword?: string
}

export interface ImportProjectsResult {
  imported: { ref: string; connectionId: string; hasDbUrl: boolean }[]
  failed: { ref: string; error: string }[]
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
  lastStatus: 'success' | 'failed' | null
  lastError: string | null
}

export interface CronValidation {
  valid: boolean
  error?: string
  nextRun: string | null
}

export interface SchedulerStatus {
  activeCount: number
  connections: ConnectionSchedulerStatus[]
}

// ─── Restore types ────────────────────────────────────────────────────────────

export interface RestoreProgress {
  stage: 'preparing' | 'database' | 'storage' | 'done'
  progress: number
  message: string
}

export interface RestoreOptions {
  /** Any registered project, not necessarily the one the backup came from. */
  connectionId: string
  filePath: string
  scope: ('database' | 'storage')[]
  /** Password of an encrypted (.enc) backup. */
  password?: string
  /** The target project's name, typed by the user. */
  confirmName: string
}

export interface RestoreResult {
  database: boolean
  storageFiles: number
  storageBuckets: number
  warnings: string[]
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

export interface CloneState {
  connectionId: string
  state: 'waiting' | 'restoring' | 'done' | 'failed'
  error?: string
  result?: RestoreResult
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error' | 'unsupported'
  version?: string
  percent?: number
  error?: string
}

// ─── ElectronAPI ──────────────────────────────────────────────────────────────

export interface ElectronAPI {
  // Backup
  runBackup: (options: BackupOptions) => Promise<BackupResult>
  cancelBackup: (jobId?: string) => Promise<void>
  runBackupBatch: (connectionIds: string[]) => Promise<BatchStartResult>
  getJobs: () => Promise<JobInfo[]>
  cancelJob: (jobId: string) => Promise<boolean>
  cancelBatch: (batchId: string) => Promise<number>

  // Updates
  getUpdateState: () => Promise<UpdateState>
  checkForUpdates: () => Promise<UpdateState>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdateState: (callback: (state: UpdateState) => void) => () => void

  // Manager (typed by ManagerApi, validated in the main process)
  manager: <K extends ManagerMethod>(method: K, payload: ManagerApi[K]['in']) => Promise<ManagerApi[K]['out']>
  onManagerChanged: (callback: () => void) => () => void
  onCloneState: (callback: (state: CloneState) => void) => () => void

  // Accounts
  listAccounts: () => Promise<AccountSummary[]>
  addAccount: (name: string, token: string) => Promise<AccountSummary>
  removeAccount: (accountId: string) => Promise<void>
  listAccountProjects: (accountId: string) => Promise<AccountProject[]>
  importAccountProjects: (accountId: string, projects: ImportProjectRequest[]) => Promise<ImportProjectsResult>
  setProjectDbPassword: (connectionId: string, password: string) => Promise<{ dbUrl: string; source: 'pooler' | 'direct' }>

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
  validateCron: (expression: string) => Promise<CronValidation>

  // Logs
  getLogs: (options: LogQuery) => Promise<LogEntry[]>

  // Destinations
  testDestination: (type: string, config: any) => Promise<{ success: boolean; message: string }>
  browseFolder: () => Promise<string | null>
  browseFile: () => Promise<string | null>
  browseBackupFile: () => Promise<string | null>

  // pg_dump installer
  detectPgDump: () => Promise<PgDumpInfo>
  downloadPgDump: () => Promise<void>
  abortPgDumpDownload: () => Promise<void>
  setPgDumpPath: (path: string) => Promise<void>
  getLinuxInstallCommands: () => Promise<string[]>
  installPgDumpViaWinget: () => Promise<void>

  // Restore
  restoreBackup: (options: RestoreOptions) => Promise<RestoreResult>
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
  onJobEvent: (callback: (event: QueueEvent<BackupProgress>) => void) => () => void
  onPgDumpDownloadProgress: (callback: (progress: PgDumpDownloadProgress) => void) => () => void
  onPgDumpWingetProgress: (callback: (progress: PgDumpWingetProgress) => void) => () => void
  onRestoreProgress: (callback: (progress: RestoreProgress) => void) => () => void
}

const electronAPI: ElectronAPI = {
  // Backup
  runBackup: (options) => ipcRenderer.invoke('backup:run', options),
  cancelBackup: (jobId) => ipcRenderer.invoke('backup:cancel', jobId),
  runBackupBatch: (connectionIds) => ipcRenderer.invoke('backup:run-batch', connectionIds),
  getJobs: () => ipcRenderer.invoke('backup:jobs'),
  cancelJob: (jobId) => ipcRenderer.invoke('backup:cancel-job', jobId),
  cancelBatch: (batchId) => ipcRenderer.invoke('backup:cancel-batch', batchId),

  // Updates
  getUpdateState: () => ipcRenderer.invoke('updater:state'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateState: (callback) => {
    const handler = (_event: any, s: UpdateState) => callback(s)
    ipcRenderer.on('updater:state', handler)
    return () => ipcRenderer.removeListener('updater:state', handler)
  },

  // Manager
  manager: (method, payload) => ipcRenderer.invoke('manager:call', method, payload),
  onCloneState: (callback) => {
    const handler = (_event: any, state: CloneState) => callback(state)
    ipcRenderer.on('clone:state', handler)
    return () => ipcRenderer.removeListener('clone:state', handler)
  },
  onManagerChanged: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('manager:changed', handler)
    return () => ipcRenderer.removeListener('manager:changed', handler)
  },

  // Accounts
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addAccount: (name, token) => ipcRenderer.invoke('accounts:add', name, token),
  removeAccount: (accountId) => ipcRenderer.invoke('accounts:remove', accountId),
  listAccountProjects: (accountId) => ipcRenderer.invoke('accounts:projects', accountId),
  importAccountProjects: (accountId, projects) => ipcRenderer.invoke('accounts:import', accountId, projects),
  setProjectDbPassword: (connectionId, password) => ipcRenderer.invoke('accounts:set-db-password', connectionId, password),

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
  validateCron: (expression) => ipcRenderer.invoke('scheduler:validate-cron', expression),

  // Logs
  getLogs: (options) => ipcRenderer.invoke('logs:get', options),

  // Destinations
  testDestination: (type, config) => ipcRenderer.invoke('destination:test', type, config),
  browseFolder: () => ipcRenderer.invoke('dialog:browse-folder'),
  browseFile: () => ipcRenderer.invoke('dialog:browse-file'),
  browseBackupFile: () => ipcRenderer.invoke('dialog:browse-backup'),

  // pg_dump installer
  detectPgDump: () => ipcRenderer.invoke('pgdump:detect'),
  downloadPgDump: () => ipcRenderer.invoke('pgdump:download'),
  abortPgDumpDownload: () => ipcRenderer.invoke('pgdump:abort'),
  setPgDumpPath: (path) => ipcRenderer.invoke('pgdump:set-path', path),
  getLinuxInstallCommands: () => ipcRenderer.invoke('pgdump:linux-commands'),
  installPgDumpViaWinget: () => ipcRenderer.invoke('pgdump:install-winget'),

  // Restore
  restoreBackup: (options) => ipcRenderer.invoke('restore:run', options),
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
  onJobEvent: (callback) => {
    const handler = (_event: any, payload: QueueEvent<BackupProgress>) => callback(payload)
    ipcRenderer.on('jobs:event', handler)
    return () => ipcRenderer.removeListener('jobs:event', handler)
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
