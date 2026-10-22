import { app, Menu, Tray, nativeImage } from 'electron'
import path from 'path'
import { translate } from '../core/mainMessages'
import { mainLanguage } from './notify'

let tray: Tray | null = null
let actions: TrayActions | null = null

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

function buildMenu(): Menu {
  const lang = mainLanguage()
  return Menu.buildFromTemplate([
    { label: translate(lang, 'tray.open'), click: actions!.showWindow },
    { label: translate(lang, 'tray.backupAll'), click: actions!.backupAll },
    { type: 'separator' },
    { label: translate(lang, 'tray.quit'), click: actions!.quit },
  ])
}

export function createTray(trayActions: TrayActions): void {
  if (tray) return
  actions = trayActions
  const icon = nativeImage.createFromPath(appIconPath()).resize({ width: 32, height: 32 })
  tray = new Tray(icon)
  tray.setToolTip(translate(mainLanguage(), 'tray.idle'))
  tray.setContextMenu(buildMenu())
  tray.on('click', trayActions.showWindow)
}

/** Rebuilds the menu after the language setting changes. */
export function refreshTrayLanguage(): void {
  if (!tray || tray.isDestroyed() || !actions) return
  tray.setContextMenu(buildMenu())
  tray.setToolTip(translate(mainLanguage(), 'tray.idle'))
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
  const lang = mainLanguage()
  const text =
    running + queued === 0
      ? translate(lang, 'tray.idle')
      : translate(lang, 'tray.activity', {
          running,
          queued: queued ? translate(lang, 'tray.queuedSuffix', { queued }) : '',
        })
  tray!.setToolTip(text)
}
