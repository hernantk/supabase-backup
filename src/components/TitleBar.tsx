import { Link, useMatch } from 'react-router-dom'
import { ChevronsUpDown, Lock, Minus, Square, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProject } from '../hooks/useProjects'
import { ProjectStatusBadge } from './ProjectStatus'

/** Windows draws its own caption buttons through titleBarOverlay; other platforms need ours. */
const hasNativeControls = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')

/**
 * Unified toolbar: same surface as the content, draggable, with room for the window controls.
 * Inside a project it carries the "account / project" breadcrumb, as the Supabase dashboard does.
 */
export function TitleBar() {
  const { t } = useTranslation()
  const match = useMatch('/p/:id/*')
  return (
    <div
      className={`drag-region h-12 shrink-0 flex items-center gap-3 pr-1 ${match ? 'border-b border-surface-700/70 pl-4' : ''} ${
        hasNativeControls ? 'pr-[140px]' : ''
      }`}
    >
      <div className="flex-1 min-w-0">{match && <ProjectBreadcrumb id={match.params.id} />}</div>
      {!hasNativeControls && (
        <div className="no-drag flex items-center">
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="p-2.5 hover:bg-surface-800 rounded-md transition-colors"
            aria-label={t('common.minimize')}
          >
            <Minus size={14} className="text-surface-400" />
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="p-2.5 hover:bg-surface-800 rounded-md transition-colors"
            aria-label={t('common.maximize')}
          >
            <Square size={12} className="text-surface-400" />
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="p-2.5 hover:bg-red-600 rounded-md transition-colors group"
            aria-label={t('common.close')}
          >
            <X size={14} className="text-surface-400 group-hover:text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

function ProjectBreadcrumb({ id }: { id?: string }) {
  const { t } = useTranslation()
  const { project } = useProject(id)
  if (!project) return null

  return (
    <nav className="flex items-center gap-1.5 min-w-0 text-[13px]" aria-label="breadcrumb">
      <Link to="/projects" className="no-drag shrink-0 px-1.5 py-1 rounded-md text-surface-400 hover:text-surface-100 hover:bg-surface-800 truncate max-w-[200px]">
        {project.accountName ?? t('nav.standalone')}
      </Link>
      <span className="text-surface-600">/</span>
      <Link
        to="/projects"
        className="no-drag flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded-md font-medium text-surface-50 hover:bg-surface-800"
        title={t('projects.backToProjects')}
      >
        <span className="truncate">{project.name}</span>
        <ChevronsUpDown size={12} className="text-surface-500 shrink-0" />
      </Link>
      {project.protected && <Lock size={12} className="text-surface-400 shrink-0" aria-label={t('projects.protectedBadge')} />}
      <span className="shrink-0">
        <ProjectStatusBadge status={project.status} />
      </span>
    </nav>
  )
}
