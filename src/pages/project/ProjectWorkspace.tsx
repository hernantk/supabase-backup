import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProject } from '../../hooks/useProjects'
import { regionLabel } from '../../lib/regions'
import { ProjectStatusBadge } from '../../components/ProjectStatus'
import { CenteredSpinner, EmptyState, PageHeader } from '../../components/ui'
import { FolderX } from 'lucide-react'
import type { ManagedProject, ProjectCapabilities } from '../../../electron/shared/managerApi'

export interface ProjectOutletContext {
  project: ManagedProject
}

export const useWorkspaceProject = () => useOutletContext<ProjectOutletContext>().project

type TabKey = 'overview' | 'sql' | 'tables' | 'auth' | 'storage' | 'functions' | 'logs' | 'schema' | 'backups' | 'secrets'

/** Order of the tabs, with the capability each one needs (undefined = always available). */
const TABS: { key: TabKey; path: string; needs?: keyof ProjectCapabilities }[] = [
  { key: 'overview', path: '' },
  { key: 'sql', path: 'sql', needs: 'sql' },
  { key: 'auth', path: 'auth', needs: 'auth' },
  { key: 'storage', path: 'storage', needs: 'storage' },
  { key: 'backups', path: 'backups' },
  { key: 'secrets', path: 'secrets', needs: 'secrets' },
]

export function ProjectWorkspace() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const { project, isLoading } = useProject(id)

  if (isLoading) return <CenteredSpinner />
  if (!project) {
    return (
      <div className="max-w-3xl pt-2">
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

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title={project.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {project.ref && <span className="font-mono text-[13px]">{project.ref}</span>}
            {project.region && <span>{regionLabel(project.region)}</span>}
            {!project.ref && <span>{project.url ?? t('projects.standalone')}</span>}
          </span>
        }
        actions={
          <>
            {project.protected && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-surface-400">
                <Lock size={13} />
                {t('projects.protectedBadge')}
              </span>
            )}
            <ProjectStatusBadge status={project.status} />
          </>
        }
      />

      <div className="segmented max-w-full overflow-x-auto" role="tablist">
        {TABS.map((tab) => {
          const available = !tab.needs || project.capabilities[tab.needs]
          return (
            <NavLink
              key={tab.key}
              to={tab.path ? `/p/${project.connectionId}/${tab.path}` : `/p/${project.connectionId}`}
              end={tab.path === ''}
              role="tab"
              className={({ isActive }) => `segmented-item ${available ? '' : 'opacity-50'} ${isActive ? 'is-active' : ''}`}
              aria-selected={undefined}
            >
              {t(`projects.tabs.${tab.key}`)}
            </NavLink>
          )
        })}
      </div>

      <Outlet context={{ project } satisfies ProjectOutletContext} />
    </div>
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
