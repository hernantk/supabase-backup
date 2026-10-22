import { BrowserWindow } from 'electron'

/** Sends an event to the first live window; a no-op while no window is open (e.g. app in the tray). */
export function emitToRenderer(channel: string, payload: unknown): void {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  win?.webContents.send(channel, payload)
}
