import type { ElectronAPI } from '../../electron/preload'

declare global {
  const __APP_VERSION__: string

  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
