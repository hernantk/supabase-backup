import { BrowserWindow, nativeTheme } from 'electron'
import type { AppSettings } from '../preload'

type Appearance = AppSettings['appearance']

/** Must match --surface-950 / --surface-100 in src/index.css so the native caption buttons blend in. */
const PALETTE = {
  light: { canvas: '#f5f7f6', symbol: '#1c1f1e' },
  dark: { canvas: '#1b1e1d', symbol: '#e9edeb' },
}

const TOOLBAR_HEIGHT = 48

function current() {
  return nativeTheme.shouldUseDarkColors ? PALETTE.dark : PALETTE.light
}

export function canvasColor(): string {
  return current().canvas
}

export function overlayColors() {
  return { color: current().canvas, symbolColor: current().symbol, height: TOOLBAR_HEIGHT }
}

/** System follows the OS; light/dark force the renderer's prefers-color-scheme as well. */
export function applyAppearance(appearance: Appearance): void {
  nativeTheme.themeSource = appearance
}

/** Keeps the native window chrome in step with the theme (system change or the user's choice). */
export function watchTheme(getWindow: () => BrowserWindow | null): void {
  nativeTheme.on('updated', () => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    win.setBackgroundColor(canvasColor())
    try {
      win.setTitleBarOverlay(overlayColors())
    } catch {
      // Platforms without a titleBarOverlay have nothing to update.
    }
  })
}
