import { Minus, Square, X } from 'lucide-react'

/** Windows draws its own caption buttons through titleBarOverlay; other platforms need ours. */
const hasNativeControls = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')

/**
 * Unified toolbar: same surface as the content, draggable, with room for the window controls.
 * The page title lives in the content (large title), so the bar itself stays quiet.
 */
export function TitleBar() {
  return (
    <div className="drag-region h-12 shrink-0 flex items-center justify-end pr-1">
      {!hasNativeControls && (
        <div className="no-drag flex items-center">
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="p-2.5 hover:bg-surface-800 rounded-md transition-colors"
            aria-label="Minimize"
          >
            <Minus size={14} className="text-surface-400" />
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="p-2.5 hover:bg-surface-800 rounded-md transition-colors"
            aria-label="Maximize"
          >
            <Square size={12} className="text-surface-400" />
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="p-2.5 hover:bg-red-600 rounded-md transition-colors group"
            aria-label="Close"
          >
            <X size={14} className="text-surface-400 group-hover:text-white" />
          </button>
        </div>
      )}
    </div>
  )
}
