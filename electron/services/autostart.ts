import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getLogger } from './logger'

export const HIDDEN_FLAG = '--hidden'

const linuxDesktopFile = () => path.join(os.homedir(), '.config', 'autostart', 'supabase-backup.desktop')

/**
 * Starts the app with the OS session, hidden in the tray, so schedules run without opening the window.
 * Windows/macOS use the login-item API; Linux needs an XDG autostart entry.
 */
export function applyStartWithSystem(enabled: boolean): void {
  // Registering the dev binary (electron.exe) as a login item would launch a bare Electron.
  if (!app.isPackaged) return

  try {
    if (process.platform === 'linux') {
      const file = linuxDesktopFile()
      if (!enabled) {
        fs.rmSync(file, { force: true })
        return
      }
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const exec = process.env.APPIMAGE ?? process.execPath
      fs.writeFileSync(
        file,
        `[Desktop Entry]\nType=Application\nName=Supabase Backup\nExec="${exec}" ${HIDDEN_FLAG}\nX-GNOME-Autostart-enabled=true\n`
      )
      return
    }
    app.setLoginItemSettings({ openAtLogin: enabled, args: enabled ? [HIDDEN_FLAG] : [] })
  } catch (err: any) {
    getLogger().warn(`Could not update start-with-system: ${err.message}`)
  }
}
