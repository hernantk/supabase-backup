import { Minus, Square, X } from 'lucide-react'

export function TitleBar() {
  return (
    <div className="drag-region h-10 bg-surface-950 border-b border-surface-800 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">SB</span>
        </div>
        <span className="text-sm font-medium text-surface-300">Supabase Backup</span>
      </div>

      <div className="no-drag flex items-center">
        <button
          onClick={() => window.electronAPI.minimizeWindow()}
          className="p-2 hover:bg-surface-800 rounded transition-colors"
        >
          <Minus size={14} className="text-surface-400" />
        </button>
        <button
          onClick={() => window.electronAPI.maximizeWindow()}
          className="p-2 hover:bg-surface-800 rounded transition-colors"
        >
          <Square size={12} className="text-surface-400" />
        </button>
        <button
          onClick={() => window.electronAPI.closeWindow()}
          className="p-2 hover:bg-red-600 rounded transition-colors group"
        >
          <X size={14} className="text-surface-400 group-hover:text-white" />
        </button>
      </div>
    </div>
  )
}
