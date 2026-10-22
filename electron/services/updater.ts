import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getLogger } from './logger'
import { emitToRenderer } from './windowBus'

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error' | 'unsupported'
  version?: string
  percent?: number
  error?: string
}

let state: UpdateState = { status: app.isPackaged ? 'idle' : 'unsupported' }
let wired = false

function publish(next: UpdateState): void {
  state = next
  emitToRenderer('updater:state', state)
}

export function getUpdateState(): UpdateState {
  return state
}

/** Updates come from GitHub Releases; nothing is downloaded or installed without the user asking. */
function wire(): void {
  if (wired) return
  wired = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => publish({ status: 'checking' }))
  autoUpdater.on('update-available', (info) => publish({ status: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => publish({ status: 'none' }))
  autoUpdater.on('download-progress', (p) => publish({ status: 'downloading', version: state.version, percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => publish({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => {
    getLogger().warn(`Updater: ${err.message}`)
    publish({ status: 'error', error: err.message })
  })
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) return state
  wire()
  try {
    await autoUpdater.checkForUpdates()
  } catch (err: any) {
    publish({ status: 'error', error: err.message })
  }
  return state
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged || state.status !== 'available') return
  wire()
  publish({ status: 'downloading', version: state.version, percent: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (err: any) {
    publish({ status: 'error', error: err.message })
  }
}

export function installUpdate(): void {
  if (state.status === 'ready') autoUpdater.quitAndInstall()
}
