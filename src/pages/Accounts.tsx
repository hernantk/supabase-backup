import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink, KeyRound, Plus, RefreshCw, Trash2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cleanError } from '../lib/api'
import { regionLabel } from '../lib/regions'
import { formatDateTime } from '../lib/format'
import { CenteredSpinner, ConfirmSheet, EmptyState, Notice, PageHeader, Section, Spinner } from '../components/ui'
import { ProjectStatusBadge } from '../components/ProjectStatus'
import type { AccountProject, AccountSummary, ImportProjectsResult } from '../../electron/preload'

const TOKEN_URL = 'https://supabase.com/dashboard/account/tokens'

export function Accounts() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => window.electronAPI.listAccounts() })
  const [removing, setRemoving] = useState<AccountSummary | null>(null)

  const refresh = () => client.invalidateQueries({ queryKey: ['accounts'] })

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader title={t('accounts.title')} subtitle={t('accounts.subtitle')} />

      <AddAccount onAdded={refresh} />

      <Section>
        {accounts.isLoading ? (
          <CenteredSpinner />
        ) : accounts.error ? (
          <Notice tone="error">{cleanError(accounts.error)}</Notice>
        ) : (accounts.data?.length ?? 0) === 0 ? (
          <EmptyState icon={Users} title={t('accounts.empty.title')} body={t('accounts.empty.body')} />
        ) : (
          <div className="space-y-4">
            {accounts.data!.map((account) => (
              <AccountCard key={account.id} account={account} onRemove={() => setRemoving(account)} />
            ))}
          </div>
        )}
      </Section>

      {removing && (
        <ConfirmSheet
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={t('accounts.removeTitle', { name: removing.name })}
          description={t('accounts.removeBody')}
          actionLabel={t('common.remove')}
          onConfirm={async () => {
            await window.electronAPI.removeAccount(removing.id).catch((e) => { throw new Error(cleanError(e)) })
            await refresh()
            await client.invalidateQueries({ queryKey: ['projects.list'] })
          }}
        />
      )}
    </div>
  )
}

function AddAccount({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [token, setToken] = useState('')

  const add = useMutation({
    mutationFn: () => window.electronAPI.addAccount(name, token),
    onSuccess: () => {
      setName('')
      setToken('')
      onAdded()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate()
      }}
      className="list-group"
    >
      <div className="px-5 pt-4 pb-1 flex items-center gap-2">
        <KeyRound size={16} className="text-brand-400" />
        <h2 className="text-[15px] font-semibold text-surface-100">{t('accounts.addTitle')}</h2>
      </div>
      <div className="px-5 py-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">{t('accounts.name')}</label>
          <input className="input" placeholder={t('accounts.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('accounts.token')}</label>
          <input className="input font-mono" type="password" autoComplete="off" placeholder="sbp_…" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
      </div>
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <a href={TOKEN_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-brand-400 hover:underline">
          <ExternalLink size={13} />
          {t('accounts.createToken')}
        </a>
        <button className="btn-primary" disabled={add.isPending || !name.trim() || !token.trim()}>
          {add.isPending ? <Spinner className="!text-current" /> : <Plus size={14} />}
          {t('accounts.verifyAndAdd')}
        </button>
      </div>
      {add.error && (
        <div className="px-5 pb-4">
          <Notice tone="error">{cleanError(add.error)}</Notice>
        </div>
      )}
    </form>
  )
}

function AccountCard({ account, onRemove }: { account: AccountSummary; onRemove: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className="list-group">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button className="flex-1 flex items-center gap-3 text-left min-w-0" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-surface-100 truncate">{account.name}</span>
            <span className="block text-[12.5px] text-surface-500">{t('accounts.added', { date: formatDateTime(account.createdAt, { hour: undefined, minute: undefined }) })}</span>
          </span>
          {open ? <ChevronUp size={16} className="text-surface-500" /> : <ChevronDown size={16} className="text-surface-500" />}
        </button>
        <button className="p-2 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10" title={t('common.remove')} onClick={onRemove}>
          <Trash2 size={16} />
        </button>
      </div>
      {open && <ProjectsPanel account={account} />}
    </div>
  )
}

function ProjectsPanel({ account }: { account: AccountSummary }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const navigate = useNavigate()
  const projects = useQuery<AccountProject[], Error>({
    queryKey: ['account-projects', account.id],
    queryFn: () => window.electronAPI.listAccountProjects(account.id),
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ImportProjectsResult | null>(null)

  const importMutation = useMutation({
    mutationFn: () =>
      window.electronAPI.importAccountProjects(
        account.id,
        [...selected].map((ref) => ({ ref, dbPassword: passwords[ref] || undefined }))
      ),
    onSuccess: async (res) => {
      setResult(res)
      setSelected(new Set())
      setPasswords({})
      await client.invalidateQueries({ queryKey: ['account-projects', account.id] })
      await client.invalidateQueries({ queryKey: ['projects.list'] })
      await client.invalidateQueries({ queryKey: ['config'] })
    },
  })

  function toggle(ref: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  return (
    <div className="border-t border-surface-700/60 px-5 py-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[13px] text-surface-400">{t('accounts.projectsHint')}</p>
        <button className="btn-ghost !px-2 !py-1 shrink-0" onClick={() => projects.refetch()}>
          <RefreshCw size={14} className={projects.isFetching ? 'animate-spin' : ''} />
          {t('common.refresh')}
        </button>
      </div>

      {projects.error && <Notice tone="error">{`${t('accounts.loadFailed')}: ${cleanError(projects.error)}`}</Notice>}
      {projects.isLoading && <Spinner />}

      {projects.data && projects.data.length > 0 && (
        <ul className="rounded-xl border border-surface-700/60 divide-y divide-surface-700/60">
          {projects.data.map((p) => {
            const imported = !!p.importedConnectionId
            const paused = !p.status.startsWith('ACTIVE')
            return (
              <li key={p.ref} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <input type="checkbox" disabled={imported || paused} checked={selected.has(p.ref)} onChange={() => toggle(p.ref)} aria-label={p.name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-surface-100 truncate">{p.name}</p>
                    <p className="text-[12.5px] text-surface-500 font-mono truncate">{p.ref} · {regionLabel(p.region)}</p>
                  </div>
                  {imported ? (
                    <button
                      className="inline-flex items-center gap-1 text-[12.5px] text-emerald-400 hover:underline"
                      onClick={() => navigate(`/p/${p.importedConnectionId}`)}
                    >
                      <CheckCircle2 size={13} />
                      {t('accounts.imported')}
                    </button>
                  ) : (
                    <ProjectStatusBadge status={p.status} />
                  )}
                </div>
                {selected.has(p.ref) && (
                  <input
                    className="input"
                    type="password"
                    autoComplete="off"
                    placeholder={t('accounts.passwordPlaceholder')}
                    value={passwords[p.ref] ?? ''}
                    onChange={(e) => setPasswords({ ...passwords, [p.ref]: e.target.value })}
                  />
                )}
                {imported && <DbPasswordEditor connectionId={p.importedConnectionId!} />}
              </li>
            )
          })}
        </ul>
      )}

      {projects.data?.length === 0 && !projects.error && <p className="text-[13.5px] text-surface-400">{t('accounts.noProjects')}</p>}

      {result && (
        <Notice tone={result.failed.length > 0 ? 'warning' : 'success'}>
          <p>{t('accounts.importedCount', { count: result.imported.length })}</p>
          {result.imported.some((i) => !i.hasDbUrl) && <p>{t('accounts.needsPassword')}</p>}
          {result.failed.map((f) => (
            <p key={f.ref}>{f.ref}: {f.error}</p>
          ))}
        </Notice>
      )}
      {importMutation.error && <Notice tone="error">{cleanError(importMutation.error)}</Notice>}

      <div className="flex justify-end">
        <button className="btn-primary" disabled={importMutation.isPending || selected.size === 0} onClick={() => importMutation.mutate()}>
          {importMutation.isPending && <Spinner className="!text-current" />}
          {t('accounts.importSelected', { count: selected.size })}
        </button>
      </div>
    </div>
  )
}

function DbPasswordEditor({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [password, setPassword] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const { source } = await window.electronAPI.setProjectDbPassword(connectionId, password)
      const cfg = await window.electronAPI.getConfig()
      const supabase = cfg.connections.find((c) => c.id === connectionId)?.supabase
      const test = supabase ? await window.electronAPI.testConnection(supabase) : null
      return { source, test }
    },
    onSuccess: async ({ test }) => {
      await client.invalidateQueries({ queryKey: ['config'] })
      await client.invalidateQueries({ queryKey: ['projects.list'] })
      if (test?.success) {
        setEditing(false)
        setPassword('')
      }
    },
  })

  if (!editing) {
    return (
      <button className="text-[12.5px] text-brand-400 hover:underline" onClick={() => setEditing(true)}>
        {t('accounts.setPassword')}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input"
          type="password"
          autoComplete="off"
          placeholder={t('accounts.dbPassword')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn-secondary whitespace-nowrap" disabled={save.isPending || !password} onClick={() => save.mutate()}>
          {save.isPending && <Spinner className="!text-current" />}
          {t('accounts.saveAndTest')}
        </button>
      </div>
      {save.data && (
        <p className={`text-[12.5px] ${save.data.test?.success ? 'text-emerald-400' : 'text-red-400'}`}>
          {save.data.test?.message ?? t('common.saved')} ({save.data.source === 'pooler' ? t('accounts.viaPooler') : t('accounts.viaDirect')})
        </p>
      )}
      {save.error && <p className="text-[12.5px] text-red-400">{cleanError(save.error)}</p>}
    </div>
  )
}
