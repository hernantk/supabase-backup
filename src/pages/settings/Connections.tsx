import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, FolderKanban, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call } from '../../lib/api'
import { useConfig, useSaveConfig } from '../../hooks/useConfig'
import { SecretField, TextField } from '../../components/Field'
import { CenteredSpinner, ConfirmSheet, EmptyState, Notice, Section, Spinner } from '../../components/ui'
import type { ConnectionConfig } from '../../../electron/preload'

function newConnection(name: string): ConnectionConfig {
  return {
    id: crypto.randomUUID(),
    name,
    supabase: { url: '', serviceRoleKey: '', dbUrl: '' },
    backup: { include: ['database', 'storage'], compress: true, encrypt: false, encryptionPassword: '', retention: { enabled: true, keepLast: 7 } },
    schedule: { enabled: false, cron: '0 2 * * *' },
  }
}

export function ConnectionsSettings() {
  const { t } = useTranslation()
  const { data: config } = useConfig()
  const save = useSaveConfig()
  const [openId, setOpenId] = useState<string | null>(null)

  if (!config) return <CenteredSpinner />

  function add() {
    const created = newConnection(t('settings.projects.newName'))
    save.mutate({ ...config!, connections: [...config!.connections, created] })
    setOpenId(created.id)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Section
        title={t('settings.projects.title')}
        footer={t('settings.projects.hint')}
        action={
          <button className="btn-secondary !py-1" onClick={add}>
            <Plus size={13} />
            {t('settings.projects.add')}
          </button>
        }
      >
        {config.connections.length === 0 ? (
          <EmptyState icon={FolderKanban} title={t('settings.projects.noneTitle')} body={t('settings.projects.noneBody')} />
        ) : (
          <div className="space-y-3">
            {config.connections.map((c) => (
              <ConnectionEditor key={c.id} connection={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function ConnectionEditor({ connection, open, onToggle }: { connection: ConnectionConfig; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const { data: config } = useConfig()
  const save = useSaveConfig()
  const [draft, setDraft] = useState(connection)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [saved, setSaved] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(connection)
  const setSupabase = (patch: Partial<ConnectionConfig['supabase']>) => setDraft({ ...draft, supabase: { ...draft.supabase, ...patch } })

  async function test() {
    setTesting(true)
    setResult(null)
    try {
      setResult(await window.electronAPI.testConnection(draft.supabase))
    } finally {
      setTesting(false)
    }
  }

  async function saveDraft() {
    await save.mutateAsync({ ...config!, connections: config!.connections.map((c) => (c.id === draft.id ? draft : c)) })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="list-group">
      <button className="list-row w-full text-left hover:bg-surface-800/50" onClick={onToggle} aria-expanded={open}>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] text-surface-100 truncate">{connection.name}</span>
          <span className="block text-[12.5px] text-surface-500 truncate">
            {connection.projectRef ? `${connection.projectRef}` : connection.supabase.url || '—'}
          </span>
        </span>
        {open ? <ChevronUp size={16} className="text-surface-500" /> : <ChevronDown size={16} className="text-surface-500" />}
      </button>

      {open && (
        <div className="px-4 py-4 space-y-4">
          <TextField label={t('settings.projects.name')} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <TextField label={t('settings.projects.url')} value={draft.supabase.url} placeholder={t('settings.projects.urlPlaceholder')} mono onChange={(url) => setSupabase({ url })} />
          <SecretField label={t('settings.projects.serviceKey')} value={draft.supabase.serviceRoleKey} onChange={(serviceRoleKey) => setSupabase({ serviceRoleKey })} />
          <SecretField
            label={t('settings.projects.dbUrl')}
            hint={t('settings.projects.dbUrlHint')}
            placeholder={t('settings.projects.dbUrlPlaceholder')}
            value={draft.supabase.dbUrl}
            onChange={(dbUrl) => setSupabase({ dbUrl })}
          />

          {result && <Notice tone={result.success ? 'success' : 'error'}>{result.message}</Notice>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={test} disabled={testing || !draft.supabase.dbUrl.trim()}>
                {testing && <Spinner className="!text-current" />}
                {testing ? t('settings.projects.testing') : t('settings.projects.test')}
              </button>
              <button className="btn-ghost !text-red-400 hover:!bg-red-500/10" onClick={() => setRemoving(true)}>
                {t('settings.projects.remove')}
              </button>
            </div>
            <button className="btn-primary" onClick={saveDraft} disabled={!dirty || save.isPending}>
              {saved ? t('common.saved') : t('settings.projects.save')}
            </button>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={removing}
        onOpenChange={setRemoving}
        title={t('settings.projects.removeTitle', { name: connection.name })}
        description={t('settings.projects.removeBody')}
        actionLabel={t('common.remove')}
        onConfirm={async () => {
          await call('projects.forget', { connectionId: connection.id })
          await client.invalidateQueries({ queryKey: ['config'] })
          await client.invalidateQueries({ queryKey: ['projects.list'] })
        }}
      />
    </div>
  )
}
