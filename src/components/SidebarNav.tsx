import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  PlayCircle,
  Settings,
  ScrollText,
  Database,
  RotateCcw,
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/backup',    icon: PlayCircle,      label: 'Run Backup' },
  { to: '/restore',   icon: RotateCcw,       label: 'Restore' },
  { to: '/settings',  icon: Settings,        label: 'Settings' },
  { to: '/logs',      icon: ScrollText,      label: 'Logs' },
]

export function SidebarNav() {
  return (
    <aside className="w-56 bg-surface-900 border-r border-surface-800 flex flex-col shrink-0">
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-6 px-3">
          <Database size={20} className="text-brand-500" />
          <span className="font-semibold text-surface-100">Backup Manager</span>
        </div>

        <nav className="space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800'
                }`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t border-surface-800">
        <div className="px-3 py-2 flex flex-col items-center rounded-lg bg-surface-800/50">
          <p className="text-xs text-surface-500">Version</p>
          <p className="text-sm text-surface-300 font-mono">1.0.0</p>
        </div>
      </div>
    </aside>
  )
}
