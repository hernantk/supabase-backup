import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Loader2, Pause, Play, PlayCircle, Trash2, Unplug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call } from '../../lib/api'
import { regionLabel } from '../../lib/regions'
import { isPaused, statusTone } from '../../hooks/useProjects'
import { ProjectStatusBadge } from '../../components/ProjectStatus'
import { ConfirmSheet, InfoRow, Notice, Section, Switch } from '../../components/ui'
import { useWorkspaceProject } from './ProjectWorkspace'

export function Overview() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const project = useWorkspaceProject()
  const [dialog, setDialog] = useState<'pause' | 'restore' | 'delete' | 'forget' | null>(null)

  const refresh = () => client.invalidateQueries({ queryKey: ['projects.list'] })
  const input = { connectionId: project.connectionId }

  const protect = useMutation({
    mutationFn: (value: boolean) => call('projects.setProtected', { ...input, protected: value }),
    onSuccess: refresh,
  })

  const busy = statusTone(project.status) === 'busy'
  const lifecycle = project.capabilities.lifecycle

  return (
    <div className="space-y-7 max-w-3xl">
      {isPaused(project.status) && (
        <Notice
          tone="warning"
          action={
            lifecycle ? (
              <button className="btn-secondary !py-1" onClick={() => setDialog('restore')}>
                <Play size={13} />
                {t('projects.overview.restore')}
              </button>
            ) : undefined
          }
        >
          <p className="font-medium">{t('projects.overview.pausedTitle')}</p>
          <p className="opacity-90">{t('projects.overview.pausedBody')}</p>
        </Notice>
      )}
      {busy && (
        <Notice tone="info">
          <span className="inline-flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            {t('projects.overview.busyBody')}
          </span>
        </Notice>
      )}

      <Section title={t('projects.overview.details')}>
        <div className="list-group">
          {project.ref && (
            <InfoRow label={t('projects.overview.reference')}>
              <span className="font-mono text-[13px]">{project.ref}</span>
            </InfoRow>
          )}
          <InfoRow label={t('projects.overview.statusLabel')}>
            {project.status ? <ProjectStatusBadge status={project.status} /> : '—'}
          </InfoRow>
          {project.region && <InfoRow label={t('projects.overview.region')}>{regionLabel(project.region)}</InfoRow>}
          {project.url && (
            <InfoRow label={t('projects.overview.url')}>
              <a href={project.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-400 hover:underline">
                {project.url.replace(/^https?:\/\//, '')}
                <ExternalLink size={12} />
              </a>
            </InfoRow>
          )}
          <InfoRow label={t('projects.overview.account')}>{project.accountName ?? t('projects.overview.accountNone')}</InfoRow>
        </div>
      </Section>

      <Section title={t('projects.overview.safety')} footer={t('projects.overview.auditNote')}>
        <div className="list-group">
          <label className="list-row cursor-pointer">
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] text-surface-100">{t('projects.overview.protect')}</span>
              <span className="block text-[12.5px] text-surface-500">{t('projects.overview.protectHint')}</span>
            </span>
            <Switch label={t('projects.overview.protect')} checked={project.protected} onChange={(v) => protect.mutate(v)} />
          </label>
        </div>
      </Section>

      <Section title={t('nav.backups')}>
        <div className="list-group">
          <button className="list-row w-full text-left hover:bg-surface-800/50" onClick={() => navigate(`/p/${project.connectionId}/backups`)}>
            <PlayCircle size={18} className="text-brand-400" />
            <span className="flex-1 text-[14px] text-surface-100">{t('backups.backUpNow')}</span>
          </button>
        </div>
      </Section>

      {lifecycle && (
        <Section title={t('projects.overview.lifecycle')}>
          <div className="list-group">
            {isPaused(project.status) ? (
              <ActionRow
                icon={<Play size={16} />}
                title={t('projects.overview.restore')}
                hint={t('projects.overview.restoreHint')}
                disabled={busy}
                onClick={() => setDialog('restore')}
              />
            ) : (
              <ActionRow
                icon={<Pause size={16} />}
                title={t('projects.overview.pause')}
                hint={t('projects.overview.pauseHint')}
                disabled={busy}
                onClick={() => setDialog('pause')}
              />
            )}
          </div>
        </Section>
      )}

      <Section title={t('projects.overview.danger')}>
        <div className="list-group">
          <ActionRow
            icon={<Unplug size={16} />}
            title={t('projects.overview.forget')}
            hint={t('projects.overview.forgetHint')}
            onClick={() => setDialog('forget')}
          />
          {lifecycle && (
            <ActionRow
              icon={<Trash2 size={16} />}
              title={t('projects.overview.delete')}
              hint={t('projects.overview.deleteHint')}
              danger
              onClick={() => setDialog('delete')}
            />
          )}
        </div>
      </Section>

      <ConfirmSheet
        open={dialog === 'pause'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('projects.overview.pauseTitle', { name: project.name })}
        description={t('projects.overview.pauseBody')}
        actionLabel={t('projects.overview.pause')}
        tone="primary"
        onConfirm={async () => {
          await call('projects.pause', input)
          await refresh()
        }}
      />
      <ConfirmSheet
        open={dialog === 'restore'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('projects.overview.restoreTitle', { name: project.name })}
        description={t('projects.overview.restoreBody')}
        actionLabel={t('projects.overview.restore')}
        tone="primary"
        onConfirm={async () => {
          await call('projects.restore', input)
          await refresh()
        }}
      />
      <ConfirmSheet
        open={dialog === 'forget'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('projects.overview.forgetTitle', { name: project.name })}
        description={t('projects.overview.forgetBody')}
        actionLabel={t('projects.overview.forgetAction')}
        onConfirm={async () => {
          await call('projects.forget', input)
          await refresh()
          navigate('/projects')
        }}
      />
      <DeleteSheet open={dialog === 'delete'} onClose={() => setDialog(null)} onDeleted={async () => { await refresh(); navigate('/projects') }} />
    </div>
  )
}

function DeleteSheet({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => Promise<void> }) {
  const { t } = useTranslation()
  const project = useWorkspaceProject()

  return (
    <ConfirmSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('projects.overview.deleteTitle', { name: project.name })}
      description={t('projects.overview.deleteBody')}
      actionLabel={t('projects.overview.deleteAction')}
      confirmText={project.name}
      onConfirm={async () => {
        await call('projects.delete', { connectionId: project.connectionId, confirmName: project.name })
        await onDeleted()
      }}
    />
  )
}

function ActionRow({
  icon,
  title,
  hint,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className="list-row w-full text-left hover:bg-surface-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
      onClick={onClick}
      disabled={disabled}
    >
      <span className={danger ? 'text-red-400' : 'text-surface-300'}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[14px] ${danger ? 'text-red-400' : 'text-surface-100'}`}>{title}</span>
        <span className="block text-[12.5px] text-surface-500">{hint}</span>
      </span>
    </button>
  )
}
