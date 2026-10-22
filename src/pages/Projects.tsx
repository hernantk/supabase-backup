import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, FolderKanban, Lock, Plus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call, useManagerQuery } from '../lib/api'
import { generatePassword, REGIONS } from '../lib/regions'
import { groupProjects, useProjects } from '../hooks/useProjects'
import { ProjectStatusBadge, StatusDot } from '../components/ProjectStatus'
import { CenteredSpinner, EmptyState, Notice, PageHeader, Section, Segmented, Sheet, Spinner } from '../components/ui'
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
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => window.electronAPI.listAccounts(), enabled: open })
  const [accountId, setAccountId] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [name, setName] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [password, setPassword] = useState(() => generatePassword())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveAccount = accountId || accounts.data?.[0]?.id || ''
  const orgs = useManagerQuery('accounts.organizations', { accountId: effectiveAccount }, { enabled: open && !!effectiveAccount })
  const effectiveOrg = orgSlug || orgs.data?.[0]?.slug || ''
  const valid = !!effectiveAccount && !!effectiveOrg && name.trim().length > 0 && password.length >= 8

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const created = await call('projects.create', {
        accountId: effectiveAccount,
        name: name.trim(),
        organizationSlug: effectiveOrg,
        region,
        dbPassword: password,
        plan,
      })
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
      {accounts.isLoading ? (
        <Spinner />
      ) : (accounts.data?.length ?? 0) === 0 ? (
        <Notice tone="info">{t('projects.create.noAccounts')}</Notice>
      ) : (
        <div className="space-y-4">
          {accounts.data!.length > 1 && (
            <div>
              <label className="label">{t('projects.create.account')}</label>
              <select className="input" value={effectiveAccount} onChange={(e) => { setAccountId(e.target.value); setOrgSlug('') }}>
                {accounts.data!.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">{t('projects.create.organization')}</label>
            {orgs.isLoading ? (
              <p className="text-[13px] text-surface-500">{t('projects.create.loadingOrgs')}</p>
            ) : orgs.data?.length ? (
              <select className="input" value={effectiveOrg} onChange={(e) => setOrgSlug(e.target.value)}>
                {orgs.data.map((o) => (
                  <option key={o.id} value={o.slug}>{o.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] text-amber-400">{orgs.error?.message ?? t('projects.create.noOrgs')}</p>
            )}
          </div>
          <div>
            <label className="label">{t('projects.create.name')}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">{t('projects.create.region')}</label>
            <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('projects.create.plan')}</label>
            <Segmented
              label={t('projects.create.plan')}
              value={plan}
              onChange={setPlan}
              options={[
                { value: 'free', label: t('projects.create.free') },
                { value: 'pro', label: t('projects.create.pro') },
              ]}
            />
            {plan === 'pro' && <p className="mt-2 text-[12.5px] text-amber-400">{t('projects.create.costWarning')}</p>}
          </div>
          <div>
            <label className="label">{t('projects.create.password')}</label>
            <div className="flex gap-2">
              <input className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => setPassword(generatePassword())}>
                {t('projects.create.generate')}
              </button>
            </div>
            <p className="mt-1.5 text-[12.5px] text-surface-500">{t('projects.create.passwordHint')}</p>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Sheet>
  )
}
