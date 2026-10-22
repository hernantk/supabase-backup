import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useManagerQuery } from '../lib/api'
import { generatePassword, REGIONS } from '../lib/regions'
import { Notice, Segmented, Spinner } from './ui'
import type { CreateProjectInput } from '../../electron/shared/managerApi'

export type NewProjectDraft = CreateProjectInput

export function emptyDraft(): NewProjectDraft {
  return { accountId: '', organizationSlug: '', name: '', region: 'us-east-1', dbPassword: generatePassword(), plan: 'free' }
}

export function isDraftValid(d: NewProjectDraft): boolean {
  return !!d.accountId && !!d.organizationSlug && d.name.trim().length > 0 && d.dbPassword.length >= 8
}

/** Account, organization, name, region, plan and database password: everything needed to create a project. */
export function NewProjectFields({
  draft,
  onChange,
  active = true,
}: {
  draft: NewProjectDraft
  onChange: (draft: NewProjectDraft) => void
  active?: boolean
}) {
  const { t } = useTranslation()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => window.electronAPI.listAccounts(), enabled: active })
  const accountId = draft.accountId || accounts.data?.[0]?.id || ''
  const orgs = useManagerQuery('accounts.organizations', { accountId }, { enabled: active && !!accountId })
  const organizationSlug = draft.organizationSlug || orgs.data?.[0]?.slug || ''

  // Push the resolved defaults up so the parent can validate and submit them.
  useEffect(() => {
    if (accountId !== draft.accountId || organizationSlug !== draft.organizationSlug) {
      onChange({ ...draft, accountId, organizationSlug })
    }
  }, [accountId, organizationSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  if (accounts.isLoading) return <Spinner />
  if ((accounts.data?.length ?? 0) === 0) return <Notice tone="info">{t('projects.create.noAccounts')}</Notice>

  return (
    <div className="space-y-4">
      {accounts.data!.length > 1 && (
        <div>
          <label className="label">{t('projects.create.account')}</label>
          <select className="input" value={accountId} onChange={(e) => onChange({ ...draft, accountId: e.target.value, organizationSlug: '' })}>
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
          <select className="input" value={organizationSlug} onChange={(e) => onChange({ ...draft, organizationSlug: e.target.value })}>
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
        <input className="input" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
      </div>
      <div>
        <label className="label">{t('projects.create.region')}</label>
        <select className="input" value={draft.region} onChange={(e) => onChange({ ...draft, region: e.target.value })}>
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t('projects.create.plan')}</label>
        <Segmented
          label={t('projects.create.plan')}
          value={draft.plan}
          onChange={(plan) => onChange({ ...draft, plan })}
          options={[
            { value: 'free', label: t('projects.create.free') },
            { value: 'pro', label: t('projects.create.pro') },
          ]}
        />
        {draft.plan === 'pro' && <p className="mt-2 text-[12.5px] text-amber-400">{t('projects.create.costWarning')}</p>}
      </div>
      <div>
        <label className="label">{t('projects.create.password')}</label>
        <div className="flex gap-2">
          <input className="input font-mono" value={draft.dbPassword} onChange={(e) => onChange({ ...draft, dbPassword: e.target.value })} />
          <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => onChange({ ...draft, dbPassword: generatePassword() })}>
            {t('projects.create.generate')}
          </button>
        </div>
        <p className="mt-1.5 text-[12.5px] text-surface-500">{t('projects.create.passwordHint')}</p>
      </div>
    </div>
  )
}
