import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import {
  startBackup,
  startBatch,
  listJobs,
  cancelJob,
  cancelBatch,
  cancelAllBackups,
  applyBackupSettings,
} from './services/backup/backupService'
import { restoreDatabase, cancelRestore } from './services/backup/restore'
import { loadConfig, saveConfig } from './services/config'
import fs from 'fs'
import { getBackupHistory, deleteBackupRecord } from './services/history'
import { testSupabaseConnection } from './services/backup/database'
import { testDestination } from './services/destinations/tester'
import { syncSchedules, stopAllSchedulers, getSchedulerStatus, validateCron } from './services/scheduler'
import { queryLogs } from './services/logger'
import { applyStartWithSystem } from './services/autostart'
import { applyAppearance } from './services/appearance'
import { registerManagerRoutes } from './ipc/managerRoutes'
import {
  listAccounts,
  addAccount,
  removeAccount,
  listAccountProjects,
  importAccountProjects,
  setProjectDbPassword,
} from './services/supabase/accounts'
import {
  detectPgDump,
  downloadPgDump,
  abortDownload,
  installViaWinget,
  setCustomPgDumpPath,
  getLinuxInstallCommands,
} from './services/pgDumpInstaller'
import type { AppConfig, BackupOptions, ImportProjectRequest, LogQuery } from './preload'

export function setupIpcHandlers(mainWindow: BrowserWindow | null) {
  registerManagerRoutes()

  // ── Backup ──────────────────────────────────────────────────────────────────
  ipcMain.handle('backup:run', async (_event, options: BackupOptions) => {
    // Progress and completion events are emitted by the backup service.
    return startBackup(options).promise
  })

  ipcMain.handle('backup:run-batch', async (_event, connectionIds: string[]) => {
    return startBatch(connectionIds)
  })

  ipcMain.handle('backup:jobs', async () => listJobs())

  ipcMain.handle('backup:cancel-job', async (_event, jobId: string) => cancelJob(jobId))

  ipcMain.handle('backup:cancel-batch', async (_event, batchId: string) => cancelBatch(batchId))

  // Without a job id (legacy single-backup screen) everything in flight is cancelled.
  ipcMain.handle('backup:cancel', async (_event, jobId?: string) => {
    if (jobId) cancelJob(jobId)
    else cancelAllBackups()
  })

  // ── Accounts (Management API; tokens stay in the main process) ──────────────
  ipcMain.handle('accounts:list', async () => listAccounts())
  ipcMain.handle('accounts:add', async (_event, name: string, token: string) => addAccount(name, token))
  ipcMain.handle('accounts:remove', async (_event, accountId: string) => removeAccount(accountId))
  ipcMain.handle('accounts:projects', async (_event, accountId: string) => listAccountProjects(accountId))
  ipcMain.handle(
    'accounts:import',
    async (_event, accountId: string, projects: ImportProjectRequest[]) => {
      const result = await importAccountProjects(accountId, projects)
      syncSchedules(loadConfig())
      return result
    }
  )
  ipcMain.handle('accounts:set-db-password', async (_event, connectionId: string, password: string) =>
    setProjectDbPassword(connectionId, password)
  )

  // ── Restore ──────────────────────────────────────────────────────────────────
  ipcMain.handle('restore:run', async (_event, connectionId: string, filePath: string) => {
    const config = loadConfig()
    const connection = config.connections.find((c) => c.id === connectionId)
    if (!connection) throw new Error(`Connection not found: "${connectionId}"`)
    return restoreDatabase(connection.supabase, filePath, (progress) => {
      mainWindow?.webContents.send('restore:progress', progress)
    })
  })

  ipcMain.handle('restore:cancel', async () => {
    return cancelRestore()
  })

  // ── Shell ────────────────────────────────────────────────────────────────────
  ipcMain.handle('shell:open-folder', async (_event, targetPath: string) => {
    // If it's a directory, open it directly.
    // If it's a file, open the parent folder and highlight the file.
    try {
      const stat = fs.statSync(targetPath)
      if (stat.isDirectory()) {
        await shell.openPath(targetPath)
      } else {
        shell.showItemInFolder(targetPath)
      }
    } catch {
      // Path doesn't exist — open the string as-is and let the OS handle it
      await shell.openPath(targetPath)
    }
  })

  // ── Config ──────────────────────────────────────────────────────────────────
  ipcMain.handle('config:get', async () => {
    return loadConfig()
  })

  ipcMain.handle('config:save', async (_event, config: AppConfig) => {
    saveConfig(config)
    applyBackupSettings(config)
    applyStartWithSystem(config.settings.startWithSystem)
    applyAppearance(config.settings.appearance)
    // Automatically reconcile all scheduled tasks whenever config is saved
    syncSchedules(config)
  })

  ipcMain.handle('config:test-connection', async (_event, config) => {
    return testSupabaseConnection(config)
  })

  // ── Backup history ──────────────────────────────────────────────────────────
  ipcMain.handle('backup:history', async () => {
    return getBackupHistory()
  })

  ipcMain.handle('backup:delete-record', async (_event, id: string) => {
    return deleteBackupRecord(id)
  })

  // ── Scheduler ───────────────────────────────────────────────────────────────
  ipcMain.handle('scheduler:status', async () => {
    return getSchedulerStatus()
  })

  ipcMain.handle('scheduler:sync', async () => {
    const config = loadConfig()
    syncSchedules(config)
  })

  ipcMain.handle('scheduler:validate-cron', async (_event, expression: string) => {
    return validateCron(expression)
  })

  ipcMain.handle('scheduler:stop', async () => {
    stopAllSchedulers()
  })

  // ── Logs ────────────────────────────────────────────────────────────────────
  ipcMain.handle('logs:get', async (_event, options: LogQuery) => {
    return queryLogs(options)
  })

  // ── Destinations ────────────────────────────────────────────────────────────
  ipcMain.handle('destination:test', async (_event, type: string, config: any) => {
    return testDestination(type, config)
  })

  // ── Dialogs ─────────────────────────────────────────────────────────────────
  ipcMain.handle('dialog:browse-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:browse-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Executables', extensions: process.platform === 'win32' ? ['exe'] : ['*'] },
      ],
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  // ── pg_dump installer ───────────────────────────────────────────────────────
  ipcMain.handle('pgdump:detect', async () => {
    return detectPgDump()
  })

  ipcMain.handle('pgdump:download', async () => {
    return downloadPgDump((progress) => {
      mainWindow?.webContents.send('pgdump:download-progress', progress)
    })
  })

  ipcMain.handle('pgdump:abort', async () => {
    abortDownload()
  })

  ipcMain.handle('pgdump:set-path', async (_event, customPath: string) => {
    setCustomPgDumpPath(customPath)
  })

  ipcMain.handle('pgdump:linux-commands', async () => {
    return getLinuxInstallCommands()
  })

  ipcMain.handle('pgdump:install-winget', async () => {
    return installViaWinget((progress) => {
      mainWindow?.webContents.send('pgdump:winget-progress', progress)
    })
  })

  // ── Window controls ─────────────────────────────────────────────────────────
  ipcMain.on('window:minimize', () => mainWindow?.minimize())

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window:close', () => mainWindow?.close())
}
