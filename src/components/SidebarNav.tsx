import { useState } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import {
  ChevronRight,
  LayoutDashboard,
  ListChecks,
  RotateCcw,
  ScrollText,
  Settings,
  Users,
  Lock,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import appIcon from '../assets/app-icon.svg'
import { groupProjects, useProjects } from '../hooks/useProjects'
import { StatusDot } from './ProjectStatus'

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
  /** Tile colour, in the spirit of the coloured glyph tiles in System Settings. */
  tile: string
}

function Tile({ icon: Icon, tile }: { icon: LucideIcon; tile: string }) {
  return (
    <span className={`w-[22px] h-[22px] rounded-[6px] ${tile} flex items-center justify-center shrink-0`}>
      <Icon size={13} strokeWidth={2.2} className="text-white" />
    </span>
  )
}

const rowClass = (isActive: boolean) =>
  `flex items-center gap-2.5 px-2 py-[5px] rounded-lg text-[13.5px] transition-colors ${
    isActive ? 'bg-surface-100/10 text-surface-50 font-medium' : 'text-surface-200 hover:bg-surface-100/[0.06]'
  }`

function Row({ to, icon, label, tile }: NavItem) {
  return (
    <NavLink to={to} className={({ isActive }) => rowClass(isActive)}>
      <Tile icon={icon} tile={tile} />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

const COLLAPSED_KEY = 'sidebar.collapsed'

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function ProjectTree() {
  const { t } = useTranslation()
  const { data } = useProjects()
  const active = useMatch('/p/:id/*')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed)

  const groups = groupProjects(data?.projects ?? [], t('nav.standalone'))

  function toggle(key: string) {
    const next = { ...collapsed, [key]: !collapsed[key] }
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable: the state just won't persist
    }
  }

  if (groups.length === 0) {
    return (
      <NavLink to="/accounts" className="block px-2 py-1 text-[12.5px] text-surface-500 hover:text-surface-300">
        {t('nav.noProjects')} · <span className="text-brand-400">{t('nav.addAccount')}</span>
      </NavLink>
    )
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => {
        const isCollapsed = !!collapsed[group.key]
        return (
          <div key={group.key}>
            <button
              onClick={() => toggle(group.key)}
              aria-expanded={!isCollapsed}
              className="w-full flex items-center gap-1 px-1.5 py-1 text-[12px] font-semibold text-surface-500 hover:text-surface-300"
            >
              <ChevronRight size={12} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
              <span className="truncate">{group.label}</span>
              <span className="ml-auto font-normal">{group.items.length}</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-0.5">
                {group.items.map((p) => (
                  <NavLink
                    key={p.connectionId}
                    to={`/p/${p.connectionId}`}
                    className={() => `${rowClass(active?.params.id === p.connectionId)} !pl-5`}
                  >
                    <span className="truncate flex-1">{p.name}</span>
                    {p.protected && <Lock size={11} className="text-surface-500 shrink-0" aria-label="protected" />}
                    <StatusDot status={p.status} />
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function SidebarNav() {
  const { t } = useTranslation()

  const backups: NavItem[] = [
    { to: '/backups', icon: ListChecks, label: t('nav.queue'), tile: 'bg-[#30b86a]' },
    { to: '/restore', icon: RotateCcw, label: t('nav.restore'), tile: 'bg-[#bf5af2]' },
  ]
  const footer: NavItem[] = [
    { to: '/logs', icon: ScrollText, label: t('nav.logs'), tile: 'bg-[#8e8e93]' },
    { to: '/settings', icon: Settings, label: t('nav.settings'), tile: 'bg-[#8e8e93]' },
  ]

  return (
    <aside className="w-[232px] bg-sidebar border-r border-surface-700/70 flex flex-col shrink-0">
      <div className="drag-region h-12 shrink-0 flex items-center gap-2.5 px-4">
        <img src={appIcon} alt="" className="w-6 h-6" draggable={false} />
        <span className="text-[13.5px] font-semibold text-surface-100 truncate">Supabase Backup</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-1 pb-3 space-y-5">
        <Row to="/dashboard" icon={LayoutDashboard} label={t('nav.dashboard')} tile="bg-[#0a84ff]" />

        <div className="space-y-1">
          <NavLink
            to="/projects"
            end
            className={({ isActive }) =>
              `block px-2 pb-1 text-[11.5px] font-semibold ${isActive ? 'text-surface-200' : 'text-surface-500 hover:text-surface-300'}`
            }
          >
            {t('nav.projects')}
          </NavLink>
          <ProjectTree />
        </div>

        <div className="space-y-0.5">
          <p className="px-2 pb-1 text-[11.5px] font-semibold text-surface-500">{t('nav.backups')}</p>
          {backups.map((item) => (
            <Row key={item.to} {...item} />
          ))}
        </div>

        <div className="space-y-0.5">
          <p className="px-2 pb-1 text-[11.5px] font-semibold text-surface-500">{t('nav.supabase')}</p>
          <Row to="/accounts" icon={Users} label={t('nav.accounts')} tile="bg-[#5e5ce6]" />
        </div>
      </nav>

      <div className="px-3 pt-2 pb-3 border-t border-surface-700/60 space-y-0.5">
        {footer.map((item) => (
          <Row key={item.to} {...item} />
        ))}
        <p className="px-2 pt-2 text-[11.5px] text-surface-500">{t('nav.version', { version: __APP_VERSION__ })}</p>
      </div>
    </aside>
  )
}
