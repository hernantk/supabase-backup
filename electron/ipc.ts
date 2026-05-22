import { ipcMain, BrowserWindow, dialog } from 'electron'
import { runBackup, cancelBackup } from './services/backup/runner'
import { loadConfig, saveConfig } from './services/config'
import { getBackupHistory, deleteBackupRecord } from './services/history'
import { testSupabaseConnection } from './services/backup/database'
import { testDestination } from './services/destinations/tester'
import { getSchedulerStatus, startScheduler, stopScheduler } from './services/scheduler'
import { queryLogs } from './services/logger'
import {
  detectPgDump,
  downloadPgDump,
  abortDownload,
  setCustomPgDumpPath,
  getLinuxInstallCommands,
} from './services/pgDumpInstaller'
import type { AppConfig, BackupOptions, LogQuery } from './preload'

export function setupIpcHandlers(mainWindow: BrowserWindow | null) {
  // Backup operations
  ipcMain.handle('backup:run', async (_event, options: BackupOptions) => {
    const config = loadConfig()
    return runBackup(config, options, (progress) => {
      mainWindow?.webContents.send('backup:progress', progress)
    })
  })

  ipcMain.handle('backup:cancel', async () => {
    return cancelBackup()
  })

  // Config
  ipcMain.handle('config:get', async () => {
    return loadConfig()
  })

  ipcMain.handle('config:save', async (_event, config: AppConfig) => {
    return saveConfig(config)
  })

  ipcMain.handle('config:test-connection', async (_event, config) => {
    return testSupabaseConnection(config)
  })

  // Backup history
  ipcMain.handle('backup:history', async () => {
    return getBackupHistory()
  })

  ipcMain.handle('backup:delete-record', async (_event, id: string) => {
    return deleteBackupRecord(id)
  })

  // Scheduler
  ipcMain.handle('scheduler:status', async () => {
    return getSchedulerStatus()
  })

  ipcMain.handle('scheduler:start', async () => {
    const config = loadConfig()
    return startScheduler(config, mainWindow)
  })

  ipcMain.handle('scheduler:stop', async () => {
    return stopScheduler()
  })

  // Logs
  ipcMain.handle('logs:get', async (_event, options: LogQuery) => {
    return queryLogs(options)
  })

  // Destinations
  ipcMain.handle('destination:test', async (_event, type: string, config: any) => {
    return testDestination(type, config)
  })

  // Dialog
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

  // pg_dump installer
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

  // Window controls
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })
}
