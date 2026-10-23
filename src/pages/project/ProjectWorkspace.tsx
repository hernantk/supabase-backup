import { useState } from 'react'
import { NavLink, Outlet, useMatch, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  Database,
  DatabaseBackup,
  FolderOpen,
  FolderX,
  Home,
  KeyRound,
  List,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Table2,
  Terminal,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProject } from '../../hooks/useProjects'
import { regionLabel } from '../../lib/regions'
import { CenteredSpinner, EmptyState } from '../../components/ui'
import type { ManagedProject, ProjectCapabilities } from '../../../electron/shared/managerApi'

export interface ProjectOutletContext {
  project: ManagedProject
}

export const useWorkspaceProject = () => useOutletContext<ProjectOutletContext>().project

type TabKey = 'overview' | 'sql' | 'tables' | 'auth' | 'storage' | 'functions' | 'logs' | 'schema' | 'backups' | 'secrets'

interface Tab {
  key: TabKey
  path: string
  icon: LucideIcon
  /** Capability the section needs (undefined = always available). */
  needs?: keyof ProjectCapabilities
  /** The page draws its own side list and fills the whole content area, like the Studio editors. */
  split?: boolean
}

/** The project rail, grouped like the Supabase dashboard; the last group sits at the bottom. */
const GROUPS: Tab[][] = [
  [{ key: 'overview', path: '', icon: Home }],
  [
    { key: 'tables', path: 'tables', icon: Table2, needs: 'sql', split: true },
    { key: 'sql', path: 'sql', icon: Terminal, needs: 'sql' },
    { key: 'schema', path: 'schema', icon: Database, needs: 'sql' },
  ],
  [
    { key: 'auth', path: 'auth', icon: Users, needs: 'auth' },
    { key: 'storage', path: 'storage', icon: FolderOpen, needs: 'storage', split: true },
    { key: 'functions', path: 'functions', icon: Zap, needs: 'functions' },
  ],
  [
    { key: 'logs', path: 'logs', icon: List, needs: 'logs' },
    { key: 'backups', path: 'backups', icon: DatabaseBackup },
  ],
  [{ key: 'secrets', path: 'secrets', icon: KeyRound, needs: 'secrets' }],
]

const TABS = GROUPS.flat()
const EXPANDED_KEY = 'projectRail.expanded'

function readExpanded() {
  try {
    return localStorage.getItem(EXPANDED_KEY) === '1'
  } catch {
    return false
  }
}

export function ProjectWorkspace() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { project, isLoading } = useProject(id)
  const section = useMatch('/p/:id/:section/*')?.params.section ?? ''

  if (isLoading) return <CenteredSpinner />
  if (!project) {
    return (
      <div className="max-w-3xl p-8">
        <EmptyState
          icon={FolderX}
          title={t('projects.notFound')}
          action={
            <button className="btn-secondary" onClick={() => navigate('/projects')}>
              {t('projects.backToProjects')}
            </button>
          }
        />
      </div>
    )
  }

  const tab = TABS.find((x) => x.path === section) ?? TABS[0]
  const available = !tab.needs || project.capabilities[tab.needs]
  const outlet = <Outlet context={{ project } satisfies ProjectOutletContext} />

  return (
    <div className="h-full flex min-h-0">
      <ProjectRail project={project} />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {tab.split && available ? (
          <div className="flex-1 min-h-0">{outlet}</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-8 pt-6 pb-10 lg:px-10 space-y-6">
              {tab.key === 'overview' ? (
                <div className="min-w-0">
                  <h1 className="page-title">{project.name}</h1>
                  <p className="page-subtitle inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {project.ref && <span className="font-mono text-[13px]">{project.ref}</span>}
                    {project.region && <span>{regionLabel(project.region)}</span>}
                    {!project.ref && <span>{project.url ?? t('projects.standalone')}</span>}
                  </p>
                </div>
              ) : (
                <h1 className="text-[20px] font-semibold tracking-tight text-surface-50">{t(`projects.tabs.${tab.key}`)}</h1>
              )}
              {outlet}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Icon rail with hover labels; it can be pinned open to show the labels inline. */
function ProjectRail({ project }: { project: ManagedProject }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(readExpanded)

  function toggle() {
    setExpanded(!expanded)
    try {
      localStorage.setItem(EXPANDED_KEY, expanded ? '0' : '1')
    } catch {
      // storage unavailable: the state just won't persist
    }
  }

  const item = (tab: Tab) => {
    const available = !tab.needs || project.capabilities[tab.needs]
    const label = t(`projects.tabs.${tab.key}`)
    return (
      <NavLink
        key={tab.key}
        to={tab.path ? `/p/${project.connectionId}/${tab.path}` : `/p/${project.connectionId}`}
        end={tab.path === ''}
        aria-label={expanded ? undefined : label}
        className={({ isActive }) =>
          `group relative flex items-center gap-3 h-9 px-[9px] rounded-lg text-[13.5px] transition-colors ${
            isActive ? 'bg-surface-100/10 text-surface-50 font-medium' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-100/[0.06]'
          } ${available ? '' : 'opacity-50'}`
        }
      >
        <tab.icon size={18} strokeWidth={1.8} className="shrink-0" />
        {expanded ? (
          <span className="truncate">{label}</span>
        ) : (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full ml-2.5 z-30 whitespace-nowrap rounded-md bg-surface-50 px-2 py-1 text-[12px] font-medium text-surface-950 opacity-0 shadow-float transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {label}
          </span>
        )}
      </NavLink>
    )
  }

  const top = GROUPS.slice(0, -1)
  const bottom = GROUPS[GROUPS.length - 1]

  return (
    <nav
      aria-label={t('projects.rail.label')}
      className={`shrink-0 flex flex-col border-r border-surface-700/70 px-2 py-2 transition-[width] duration-200 ${expanded ? 'w-[208px]' : 'w-[54px]'}`}
    >
      <div className="flex-1 space-y-1">
        {top.map((group, i) => (
          <div key={i} className={`space-y-0.5 ${i > 0 ? 'pt-1 border-t border-surface-700/60' : ''}`}>
            {group.map(item)}
          </div>
        ))}
      </div>
      <div className="space-y-0.5 pt-1 border-t border-surface-700/60">
        {bottom.map(item)}
        <button
          onClick={toggle}
          className="flex items-center gap-3 w-full h-9 px-[9px] rounded-lg text-[13px] text-surface-500 hover:text-surface-200 hover:bg-surface-100/[0.06]"
          aria-label={expanded ? t('projects.rail.collapse') : t('projects.rail.expand')}
          title={expanded ? t('projects.rail.collapse') : t('projects.rail.expand')}
        >
          {expanded ? <PanelLeftClose size={18} strokeWidth={1.8} /> : <PanelLeftOpen size={18} strokeWidth={1.8} />}
          {expanded && <span className="truncate">{t('projects.rail.collapse')}</span>}
        </button>
      </div>
    </nav>
  )
}

/** Studio-style editor layout: a titled side list on the left, the selected item filling the rest. */
export function SplitView({
  title,
  action,
  side,
  children,
}: {
  title: string
  action?: React.ReactNode
  side: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="h-full flex min-h-0">
      <aside className="w-[248px] shrink-0 flex flex-col min-h-0 border-r border-surface-700/70">
        <div className="h-12 shrink-0 flex items-center justify-between gap-2 px-4">
          <h1 className="text-[14px] font-semibold text-surface-50 truncate">{title}</h1>
          {action}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{side}</div>
      </aside>
      <section className="flex-1 min-w-0 overflow-y-auto px-6 py-5">{children}</section>
    </div>
  )
}

/** A row of a `SplitView` side list. */
export function SideItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 h-8 px-2 rounded-md text-left text-[13px] transition-colors ${
        active ? 'bg-surface-100/10 text-surface-50 font-medium' : 'text-surface-300 hover:bg-surface-100/[0.06] hover:text-surface-100'
      }`}
    >
      {children}
    </button>
  )
}

/** Explains why a tab is unavailable instead of showing a broken screen. */
export function Requires({
  need,
  project,
  children,
}: {
  need: keyof ProjectCapabilities
  project: ManagedProject
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  if (project.capabilities[need]) return <>{children}</>

  const accountOnly = need === 'lifecycle' || need === 'secrets' || need === 'functions' || need === 'logs' || need === 'migrations'
  if (accountOnly) {
    return (
      <EmptyState
        icon={Lock}
        title={t('projects.needsAccount.title')}
        body={t('projects.needsAccount.body')}
        action={
          <button className="btn-primary" onClick={() => navigate('/accounts')}>
            {t('projects.needsAccount.action')}
          </button>
        }
      />
    )
  }
  if (need === 'sql') {
    return <EmptyState icon={Lock} title={t('projects.needsDatabase.title')} body={t('projects.needsDatabase.body')} />
  }
  return <EmptyState icon={Lock} title={t('projects.needsKey.title')} body={t('projects.needsKey.body')} />
}
