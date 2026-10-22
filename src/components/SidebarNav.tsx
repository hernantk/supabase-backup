import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  PlayCircle,
  Settings,
  ScrollText,
  RotateCcw,
  ListChecks,
  Users,
  type LucideIcon,
} from 'lucide-react'
import appIcon from '../assets/app-icon.svg'

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
  /** Tile colour, in the spirit of the coloured glyph tiles in System Settings. */
  tile: string
}

const sections: { title?: string; items: NavItem[] }[] = [
  {
    items: [{ to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', tile: 'bg-[#0a84ff]' }],
  },
  {
    title: 'Backups',
    items: [
      { to: '/backups', icon: ListChecks, label: 'Queue', tile: 'bg-[#30b86a]' },
      { to: '/backup', icon: PlayCircle, label: 'Run Backup', tile: 'bg-[#ff9f0a]' },
      { to: '/restore', icon: RotateCcw, label: 'Restore', tile: 'bg-[#bf5af2]' },
    ],
  },
  {
    title: 'Supabase',
    items: [{ to: '/accounts', icon: Users, label: 'Accounts', tile: 'bg-[#5e5ce6]' }],
  },
]

const footerItems: NavItem[] = [
  { to: '/logs', icon: ScrollText, label: 'Logs', tile: 'bg-[#8e8e93]' },
  { to: '/settings', icon: Settings, label: 'Settings', tile: 'bg-[#8e8e93]' },
]

function Row({ to, icon: Icon, label, tile }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2 py-[5px] rounded-lg text-[13.5px] transition-colors ${
          isActive
            ? 'bg-surface-100/10 text-surface-50 font-medium'
            : 'text-surface-200 hover:bg-surface-100/[0.06]'
        }`
      }
    >
      <span className={`w-[22px] h-[22px] rounded-[6px] ${tile} flex items-center justify-center shrink-0`}>
        <Icon size={13} strokeWidth={2.2} className="text-white" />
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

export function SidebarNav() {
  return (
    <aside className="w-[232px] bg-sidebar border-r border-surface-700/70 flex flex-col shrink-0">
      <div className="drag-region h-12 shrink-0 flex items-center gap-2.5 px-4">
        <img src={appIcon} alt="" className="w-6 h-6" draggable={false} />
        <span className="text-[13.5px] font-semibold text-surface-100 truncate">Supabase Backup</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-1 pb-3 space-y-5">
        {sections.map((section, i) => (
          <div key={section.title ?? i} className="space-y-0.5">
            {section.title && (
              <p className="px-2 pb-1 text-[11.5px] font-semibold text-surface-500">{section.title}</p>
            )}
            {section.items.map((item) => (
              <Row key={item.to} {...item} />
            ))}
          </div>
        ))}
      </nav>

      <div className="px-3 pt-2 pb-3 border-t border-surface-700/60 space-y-0.5">
        {footerItems.map((item) => (
          <Row key={item.to} {...item} />
        ))}
        <p className="px-2 pt-2 text-[11.5px] text-surface-500">Version {__APP_VERSION__}</p>
      </div>
    </aside>
  )
}
