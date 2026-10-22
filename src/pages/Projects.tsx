import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, FolderKanban, Lock, Plus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call } from '../lib/api'
import { emptyDraft, isDraftValid, NewProjectFields, type NewProjectDraft } from '../components/NewProjectFields'
import { groupProjects, useProjects } from '../hooks/useProjects'
import { ProjectStatusBadge, StatusDot } from '../components/ProjectStatus'
import { CenteredSpinner, EmptyState, Notice, PageHeader, Section, Sheet, Spinner } from '../components/ui'
import { regionLabel } from '../lib/regions'

export function Projects() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { data, isLoading, isFetching, error } = useProjects()
  const [creating, setCreating] = useState(false)

  const groups = groupProjects(data?.projects ?? [], t('projects.standalone'))

  return (
    <div className="space-y-7 max-w-5xl">
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.subtitle')}
        actions={
          <>
            <button className="btn-secondary" onClick={() => client.invalidateQueries({ queryKey: ['projects.list'] })}>
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
              {t('common.refresh')}
            </button>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={14} />
              {t('projects.new')}
            </button>
          </>
        }
      />

      {error && <Notice tone="error">{error.message}</Notice>}
      {data?.accountErrors.map((e) => (
        <Notice key={e.accountId} tone="warning">
          {t('projects.accountError', { account: e.accountName, error: e.error })}
        </Notice>
      ))}

      {isLoading ? (
        <CenteredSpinner />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={t('projects.empty.title')}
          body={t('projects.empty.body')}
          action={
            <button className="btn-primary" onClick={() => navigate('/accounts')}>
              {t('projects.empty.action')}
            </button>
          }
        />
      ) : (
        groups.map((group) => (
          <Section key={group.key} title={group.label} footer={group.accountId ? undefined : t('projects.standaloneHint')}>
            <ul className="list-group">
              {group.items.map((p) => (
                <li key={p.connectionId}>
                  <button
                    className="list-row w-full text-left hover:bg-surface-800/50 transition-colors min-h-[52px]"
                    onClick={() => navigate(`/p/${p.connectionId}`)}
                  >
                    <StatusDot status={p.status} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] text-surface-100 truncate">{p.name}</span>
                      <span className="block text-[12.5px] text-surface-500 truncate font-mono">
                        {[p.ref, p.region ? regionLabel(p.region) : undefined].filter(Boolean).join(' · ') || p.url || '—'}
                      </span>
                    </span>
                    {p.protected && (
                      <span className="inline-flex items-center gap-1 text-[12px] text-surface-400">
                        <Lock size={12} />
                        {t('projects.protectedBadge')}
                      </span>
                    )}
                    <ProjectStatusBadge status={p.status} />
                    <ChevronRight size={16} className="text-surface-500 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}

      <CreateProjectSheet
        open={creating}
        onOpenChange={setCreating}
        onCreated={(connectionId) => {
          setCreating(false)
          client.invalidateQueries({ queryKey: ['projects.list'] })
          navigate(`/p/${connectionId}`)
        }}
      />
    </div>
  )
}

function CreateProjectSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (connectionId: string) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<NewProjectDraft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = isDraftValid(draft)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const created = await call('projects.create', { ...draft, name: draft.name.trim() })
      setDraft(emptyDraft())
      onCreated(created.connectionId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={t('projects.create.title')}
      description={t('projects.create.body')}
      footer={
        <>
          <button className="btn-secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={!valid || busy} onClick={submit}>
            {busy && <Spinner className="!text-current" />}
            {t('projects.create.submit')}
          </button>
        </>
      }
    >
      <NewProjectFields draft={draft} onChange={setDraft} active={open} />
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
    </Sheet>
  )
}
