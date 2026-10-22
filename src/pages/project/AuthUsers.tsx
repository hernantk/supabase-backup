import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, ChevronLeft, ChevronRight, Plus, ShieldCheck, Trash2, UserRound, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call, useManagerQuery } from '../../lib/api'
import { formatDateTime, formatRelative } from '../../lib/format'
import { CenteredSpinner, ConfirmSheet, EmptyState, Notice, Sheet, Spinner, Switch } from '../../components/ui'
import { Requires, useWorkspaceProject } from './ProjectWorkspace'
import type { AuthUser } from '../../../electron/shared/managerApi'

const PER_PAGE = 50

export function AuthUsers() {
  const project = useWorkspaceProject()
  return (
    <Requires need="auth" project={project}>
      <AuthUsersInner />
    </Requires>
  )
}

function who(u: AuthUser, anonymousLabel: string): string {
  return u.email ?? u.phone ?? (u.isAnonymous ? anonymousLabel : u.id.slice(0, 8))
}

function AuthUsersInner() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [action, setAction] = useState<{ kind: 'ban' | 'unban' | 'delete'; user: AuthUser } | null>(null)

  const input = { connectionId: project.connectionId }
  const query = useManagerQuery('auth.list', { ...input, page, perPage: PER_PAGE })
  const refresh = () => client.invalidateQueries({ queryKey: ['auth.list'] })

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const users = query.data?.users ?? []
    if (!needle) return users
    return users.filter((u) => [u.email, u.phone, u.id].some((v) => v?.toLowerCase().includes(needle)))
  }, [query.data, filter])

  const banned = (u: AuthUser) => !!u.bannedUntil && new Date(u.bannedUntil) > new Date()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input !w-auto flex-1 min-w-[240px]"
          placeholder={t('authUsers.searchPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} />
          {t('authUsers.create')}
        </button>
      </div>

      {query.error && <Notice tone="error">{query.error.message}</Notice>}

      {query.isLoading ? (
        <CenteredSpinner />
      ) : (query.data?.users.length ?? 0) === 0 && !query.error ? (
        <EmptyState icon={Users} title={t('authUsers.empty.title')} body={t('authUsers.empty.body')} />
      ) : (
        <>
          <ul className="list-group">
            {visible.map((u) => (
              <li key={u.id} className="list-row min-h-[56px]">
                <span className="w-8 h-8 rounded-full bg-surface-800 flex items-center justify-center text-surface-400 shrink-0">
                  <UserRound size={15} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] text-surface-100 truncate">{who(u, t('authUsers.anonymous'))}</span>
                  <span className="block text-[12px] text-surface-500 font-mono truncate">{u.id}</span>
                </span>
                <span className="hidden lg:flex gap-1 w-36 shrink-0">
                  {u.providers.map((p) => (
                    <span key={p} className="px-2 py-0.5 rounded bg-surface-800 text-[11.5px] text-surface-300">{p}</span>
                  ))}
                </span>
                <span className="hidden md:block w-32 shrink-0 text-[12.5px] text-surface-400" title={formatDateTime(u.createdAt)}>
                  {formatRelative(u.createdAt)}
                </span>
                <span className="hidden md:block w-32 shrink-0 text-[12.5px] text-surface-400">
                  {u.lastSignInAt ? formatRelative(u.lastSignInAt) : t('authUsers.never')}
                </span>
                <span className="w-28 shrink-0 text-[12px]">
                  {banned(u) ? (
                    <span className="text-red-400">{t('authUsers.state.banned')}</span>
                  ) : u.confirmedAt ? (
                    <span className="text-emerald-400">{t('authUsers.state.confirmed')}</span>
                  ) : (
                    <span className="text-amber-400">{t('authUsers.state.unconfirmed')}</span>
                  )}
                </span>
                <span className="flex gap-1 shrink-0">
                  <button
                    className="p-1.5 rounded text-surface-500 hover:text-surface-100 hover:bg-surface-800"
                    title={banned(u) ? t('authUsers.unban') : t('authUsers.ban')}
                    onClick={() => setAction({ kind: banned(u) ? 'unban' : 'ban', user: u })}
                  >
                    {banned(u) ? <ShieldCheck size={15} /> : <Ban size={15} />}
                  </button>
                  <button
                    className="p-1.5 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10"
                    title={t('common.delete')}
                    onClick={() => setAction({ kind: 'delete', user: u })}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-[13px] text-surface-400">
            <span>
              {t('authUsers.page', { page })}
              {query.data?.total !== undefined && ` · ${t('authUsers.total', { count: query.data.total })}`}
            </span>
            <div className="flex gap-2">
              <button className="btn-secondary !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft size={14} />
                {t('common.previous')}
              </button>
              <button className="btn-secondary !py-1" disabled={!query.data?.hasMore} onClick={() => setPage(page + 1)}>
                {t('common.next')}
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      <CreateUserSheet open={creating} onClose={() => setCreating(false)} onCreated={refresh} />

      {action && (
        <ConfirmSheet
          open
          onOpenChange={(o) => !o && setAction(null)}
          title={t(`authUsers.${action.kind === 'delete' ? 'deleteTitle' : action.kind === 'ban' ? 'banTitle' : 'unbanTitle'}` as never, {
            who: who(action.user, t('authUsers.anonymous')),
          })}
          description={t(`authUsers.${action.kind === 'delete' ? 'deleteBody' : action.kind === 'ban' ? 'banBody' : 'unbanBody'}` as never)}
          actionLabel={action.kind === 'delete' ? t('authUsers.deleteAction') : action.kind === 'ban' ? t('authUsers.ban') : t('authUsers.unban')}
          tone={action.kind === 'unban' ? 'primary' : 'danger'}
          confirmText={action.kind === 'delete' ? (action.user.email ?? undefined) : undefined}
          onConfirm={async () => {
            if (action.kind === 'delete') await call('auth.delete', { ...input, userId: action.user.id })
            else await call('auth.setBanned', { ...input, userId: action.user.id, banned: action.kind === 'ban' })
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function CreateUserSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmEmail, setConfirmEmail] = useState(true)
  const [asking, setAsking] = useState(false)

  const create = useMutation({
    mutationFn: () => call('auth.create', { connectionId: project.connectionId, email, password, confirmEmail }),
    onSuccess: () => {
      onCreated()
      setEmail('')
      setPassword('')
      setAsking(false)
      onClose()
    },
  })
  const valid = /.+@.+\..+/.test(email) && password.length >= 6

  function submit() {
    if (project.protected && !asking) setAsking(true)
    else create.mutate()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && !create.isPending && (setAsking(false), onClose())}
      title={asking ? t('authUsers.protectedTitle', { name: project.name }) : t('authUsers.createTitle')}
      description={asking ? t('authUsers.protectedBody') : t('authUsers.createBody')}
      footer={
        <>
          <button className="btn-secondary" disabled={create.isPending} onClick={() => (asking ? setAsking(false) : onClose())}>
            {asking ? t('common.back') : t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending && <Spinner className="!text-current" />}
            {t('authUsers.createAction')}
          </button>
        </>
      }
    >
      {!asking && (
        <div className="space-y-4">
          <div>
            <label className="label">{t('authUsers.email')}</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">{t('authUsers.password')}</label>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="mt-1.5 text-[12.5px] text-surface-500">{t('authUsers.passwordHint')}</p>
          </div>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span>
              <span className="block text-[14px] text-surface-100">{t('authUsers.confirmEmail')}</span>
              <span className="block text-[12.5px] text-surface-500">{t('authUsers.confirmEmailHint')}</span>
            </span>
            <Switch label={t('authUsers.confirmEmail')} checked={confirmEmail} onChange={setConfirmEmail} />
          </label>
        </div>
      )}
      {create.error && <div className="mt-4"><Notice tone="error">{create.error.message}</Notice></div>}
    </Sheet>
  )
}
