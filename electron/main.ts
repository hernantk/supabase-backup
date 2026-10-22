import { app, BrowserWindow, dialog, powerMonitor, shell } from 'electron'
import path from 'path'
import { setupIpcHandlers } from './ipc'
import { initLogger } from './services/logger'
import { initScheduler, runCatchUp } from './services/scheduler'
import { loadConfig } from './services/config'
import {
  applyBackupSettings,
  cancelAllBackups,
  listJobs,
  onBackupActivity,
  startBatch,
} from './services/backup/backupService'
import { applyStartWithSystem, HIDDEN_FLAG } from './services/autostart'
import { createTray, destroyTray, hasTray, setTrayActivity } from './services/tray'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

const isDev = !app.isPackaged
const startHidden = process.argv.includes(HIDDEN_FLAG)

/** Delay before looking for missed runs, so startup and the first window paint are not slowed down. */
const CATCH_UP_DELAY_MS = 15_000

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#020617',
      symbolColor: '#e2e8f0',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    icon: path.join(__dirname, '../resources/icon.png'),
    backgroundColor: '#020617',
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    // Started by the OS at login: stay in the tray (when there is one) and keep schedules running.
    if (!(startHidden && hasTray())) mainWindow?.show()
  })

  if (isDev) {
    // vite-plugin-electron exposes the real dev server URL (the port moves when 5173 is taken).
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (event) => {
    if (isQuitting || !hasTray() || !loadConfig().settings.closeToTray) return
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showWindow() {
  if (!mainWindow) createWindow()
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
}

/** Asks before quitting while backups are running, because quitting cancels them. */
async function requestQuit() {
  const active = listJobs().filter((j) => j.state === 'running' || j.state === 'queued')
  if (active.length > 0) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel backups and quit', 'Keep running'],
      defaultId: 1,
      cancelId: 1,
      message: `${active.length} backup${active.length === 1 ? ' is' : 's are'} still running or queued.`,
      detail: 'Quitting now cancels them. Schedules only run while the app is running.',
    })
    if (response !== 0) return
  }
  app.quit()
}

function backupAllProjects() {
  const ids = loadConfig()
    .connections.filter((c) => c.supabase.url || c.supabase.dbUrl)
    .map((c) => c.id)
  if (ids.length > 0) startBatch(ids)
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.whenReady().then(async () => {
    const logger = initLogger()
    logger.info('Application starting...')

    const config = loadConfig()

    try {
      createTray({ showWindow, backupAll: backupAllProjects, quit: () => void requestQuit() })
    } catch (err: any) {
      // Some Linux desktops have no tray; closing the window then quits as before.
      logger.warn(`Tray unavailable: ${err.message}`)
    }

    // Create the window FIRST so mainWindow is not null when IPC handlers / scheduler
    // capture it in their closures (they use mainWindow?.webContents.send for events).
    createWindow()

    setupIpcHandlers(mainWindow)
    applyBackupSettings(config)
    applyStartWithSystem(config.settings.startWithSystem)
    onBackupActivity(setTrayActivity)
    initScheduler(config)

    setTimeout(() => runCatchUp(), CATCH_UP_DELAY_MS)
    // Timers do not fire while the PC sleeps, so look for missed runs again when it wakes up.
    powerMonitor.on('resume', () => setTimeout(() => runCatchUp(), CATCH_UP_DELAY_MS / 3))

    app.on('activate', showWindow)
  })

  app.on('before-quit', () => {
    isQuitting = true
    cancelAllBackups()
    destroyTray()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
