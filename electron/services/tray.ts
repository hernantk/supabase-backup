import { app, Menu, Tray, nativeImage } from 'electron'
import path from 'path'

let tray: Tray | null = null

export function appIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'icon.png')
    : path.join(app.getAppPath(), 'resources', 'icon.png')
}

export interface TrayActions {
  showWindow: () => void
  backupAll: () => void
  quit: () => void
}

export function createTray(actions: TrayActions): void {
  if (tray) return
  const icon = nativeImage.createFromPath(appIconPath()).resize({ width: 32, height: 32 })
  tray = new Tray(icon)
  tray.setToolTip('Supabase Backup')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Supabase Backup', click: actions.showWindow },
      { label: 'Back up all projects now', click: actions.backupAll },
      { type: 'separator' },
      { label: 'Quit', click: actions.quit },
    ])
  )
  tray.on('click', actions.showWindow)
}

export function hasTray(): boolean {
  return tray !== null && !tray.isDestroyed()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

/** Shows what the app is doing while the window is hidden. */
export function setTrayActivity(running: number, queued: number): void {
  if (!hasTray()) return
  const text =
    running + queued === 0
      ? 'Supabase Backup'
      : `Supabase Backup — ${running} running${queued ? `, ${queued} queued` : ''}`
  tray!.setToolTip(text)
}
