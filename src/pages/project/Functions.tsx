import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileText, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call, useManagerQuery } from '../../lib/api'
import { formatRelative } from '../../lib/format'
import { CenteredSpinner, EmptyState, Notice } from '../../components/ui'
import { Requires, useWorkspaceProject } from './ProjectWorkspace'

export function Functions() {
  const project = useWorkspaceProject()
  return (
    <Requires need="functions" project={project}>
      <FunctionsInner />
    </Requires>
  )
}

function FunctionsInner() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const project = useWorkspaceProject()
  const functions = useManagerQuery('functions.list', { connectionId: project.connectionId })
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function download(slug: string) {
    try {
      const { savedTo } = await call('functions.download', { connectionId: project.connectionId, slug })
      if (savedTo) setToast({ tone: 'success', text: t('insights.functions.savedTo', { path: savedTo }) })
    } catch (err: any) {
      setToast({ tone: 'error', text: err.message })
    }
  }

  if (functions.isLoading) return <CenteredSpinner />
  if (functions.error) return <Notice tone="error">{functions.error.message}</Notice>
  if ((functions.data?.length ?? 0) === 0) {
    return <EmptyState icon={Zap} title={t('insights.functions.empty.title')} body={t('insights.functions.empty.body')} />
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {toast && <Notice tone={toast.tone}>{toast.text}</Notice>}
      <ul className="list-group">
        {functions.data!.map((f) => (
          <li key={f.id} className="list-row min-h-[60px]">
            <Zap size={16} className="text-brand-400 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block font-mono text-[14px] text-surface-100 truncate">{f.slug}</span>
              <span className="block text-[12.5px] text-surface-500">
                {t('insights.functions.version', { version: f.version })}
                {f.updatedAt && ` · ${t('insights.functions.updated', { when: formatRelative(f.updatedAt) })}`}
              </span>
            </span>
            <span className={`px-2 py-0.5 rounded text-[11.5px] ${f.verifyJwt ? 'bg-surface-800 text-surface-300' : 'bg-amber-500/10 text-amber-400'}`}>
              {f.verifyJwt ? t('insights.functions.verifyJwt') : t('insights.functions.noJwt')}
            </span>
            <span className={`text-[12px] w-16 ${f.status === 'ACTIVE' ? 'text-emerald-400' : 'text-surface-400'}`}>{f.status.toLowerCase()}</span>
            <span className="flex gap-1 shrink-0">
              <button
                className="btn-ghost !px-2 !py-1"
                onClick={() => navigate(`/p/${project.connectionId}/logs?source=functions`)}
              >
                <FileText size={13} />
                {t('insights.functions.viewLogs')}
              </button>
              <button className="btn-ghost !px-2 !py-1" onClick={() => download(f.slug)}>
                <Download size={13} />
                {t('insights.functions.download')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[12.5px] text-surface-500">{t('insights.functions.note')}</p>
    </div>
  )
}
