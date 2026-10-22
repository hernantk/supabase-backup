import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye, Key, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call, useManagerQuery } from '../../lib/api'
import { formatRelative } from '../../lib/format'
import { CenteredSpinner, ConfirmSheet, Notice, Section, Sheet, Spinner } from '../../components/ui'
import { Requires, useWorkspaceProject } from './ProjectWorkspace'

export function SecretsKeys() {
  const project = useWorkspaceProject()
  return (
    <Requires need="secrets" project={project}>
      <SecretsInner />
    </Requires>
  )
}

function SecretsInner() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const client = useQueryClient()
  const input = { connectionId: project.connectionId }

  const secrets = useManagerQuery('secrets.list', input)
  const keys = useManagerQuery('apiKeys.list', input)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)

  const refresh = () => client.invalidateQueries({ queryKey: ['secrets.list'] })

  async function reveal(id: string, copy: boolean) {
    setKeyError(null)
    try {
      const { key } = await call('apiKeys.reveal', { ...input, id })
      if (copy) {
        await navigator.clipboard.writeText(key)
        setToast(t('secrets.revealed'))
        setTimeout(() => setToast(null), 2000)
      } else {
        setShown((prev) => ({ ...prev, [id]: key }))
        // Revealed keys stay on screen only briefly.
        setTimeout(() => setShown((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id))), 15_000)
      }
    } catch (err: any) {
      setKeyError(err.message)
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <Section
        title={t('secrets.apiKeys')}
        footer={t('secrets.apiKeysHint')}
        action={toast ? <span className="text-[12.5px] text-emerald-400">{toast}</span> : undefined}
      >
        {keyError && <div className="mb-3"><Notice tone="error">{keyError}</Notice></div>}
        {keys.isLoading ? (
          <CenteredSpinner />
        ) : keys.error ? (
          <Notice tone="error">{keys.error.message}</Notice>
        ) : (
          <ul className="list-group">
            {keys.data?.map((k) => (
              <li key={k.id} className="list-row min-h-[56px]">
                <Key size={16} className="text-surface-400 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] text-surface-100">{k.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-surface-800 text-[11px] text-surface-300">
                      {k.type in { legacy: 1, publishable: 1, secret: 1 } ? t(`secrets.keyTypes.${k.type}` as never) : k.type}
                    </span>
                  </span>
                  <span className="block font-mono text-[12px] text-surface-500 truncate">{shown[k.id] ?? k.masked}</span>
                </span>
                <button className="p-1.5 rounded hover:bg-surface-800 text-surface-400" title={t('common.reveal')} onClick={() => reveal(k.id, false)}>
                  <Eye size={15} />
                </button>
                <button className="p-1.5 rounded hover:bg-surface-800 text-surface-400" title={t('common.copy')} onClick={() => reveal(k.id, true)}>
                  <Copy size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t('secrets.secrets')}
        footer={t('secrets.secretsHint')}
        action={
          <button className="btn-secondary !py-1" onClick={() => setAdding(true)}>
            <Plus size={13} />
            {t('secrets.add')}
          </button>
        }
      >
        {secrets.isLoading ? (
          <CenteredSpinner />
        ) : secrets.error ? (
          <Notice tone="error">{secrets.error.message}</Notice>
        ) : (secrets.data?.length ?? 0) === 0 ? (
          <div className="list-group px-4 py-5 text-[13.5px] text-surface-400">{t('secrets.noSecrets')}</div>
        ) : (
          <ul className="list-group">
            {secrets.data!.map((s) => (
              <li key={s.name} className="list-row">
                <span className="flex-1 min-w-0">
                  <span className="block font-mono text-[13.5px] text-surface-100 truncate">{s.name}</span>
                  {s.updatedAt && <span className="block text-[12px] text-surface-500">{t('secrets.updated', { when: formatRelative(s.updatedAt) })}</span>}
                </span>
                <button className="p-1.5 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10" title={t('common.delete')} onClick={() => setRemoving(s.name)}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <AddSecretSheet open={adding} onClose={() => setAdding(false)} onSaved={refresh} />

      {removing && (
        <ConfirmSheet
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={t('secrets.deleteTitle', { name: removing })}
          description={t('secrets.deleteBody')}
          actionLabel={t('common.delete')}
          onConfirm={async () => {
            await call('secrets.delete', { ...input, name: removing })
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function AddSecretSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [asking, setAsking] = useState(false)

  const save = useMutation({
    mutationFn: () => call('secrets.set', { connectionId: project.connectionId, name: name.trim(), value }),
    onSuccess: () => {
      onSaved()
      setName('')
      setValue('')
      setAsking(false)
      onClose()
    },
  })
  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name.trim()) && value.length > 0

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && !save.isPending && (setAsking(false), onClose())}
      title={asking ? t('secrets.protectedTitle', { name: project.name }) : t('secrets.addTitle')}
      description={asking ? t('secrets.protectedBody') : t('secrets.addBody')}
      footer={
        <>
          <button className="btn-secondary" disabled={save.isPending} onClick={() => (asking ? setAsking(false) : onClose())}>
            {asking ? t('common.back') : t('common.cancel')}
          </button>
          <button
            className="btn-primary"
            disabled={!valid || save.isPending}
            onClick={() => (project.protected && !asking ? setAsking(true) : save.mutate())}
          >
            {save.isPending && <Spinner className="!text-current" />}
            {t('common.save')}
          </button>
        </>
      }
    >
      {!asking && (
        <div className="space-y-4">
          <div>
            <label className="label">{t('secrets.name')}</label>
            <input className="input font-mono" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <p className="mt-1.5 text-[12.5px] text-surface-500">{t('secrets.nameHint')}</p>
          </div>
          <div>
            <label className="label">{t('secrets.value')}</label>
            <textarea className="input font-mono min-h-[88px]" value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />
          </div>
        </div>
      )}
      {save.error && <div className="mt-4"><Notice tone="error">{save.error.message}</Notice></div>}
    </Sheet>
  )
}
