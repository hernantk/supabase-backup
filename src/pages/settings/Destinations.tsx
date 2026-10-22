import { useEffect, useState, type ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConfig, useSaveConfig } from '../../hooks/useConfig'
import { SecretField, TextField, Field } from '../../components/Field'
import { CenteredSpinner, Notice, Spinner, Switch } from '../../components/ui'
import type { DestinationConfig } from '../../../electron/preload'

type Kind = keyof DestinationConfig

export function DestinationsSettings() {
  const { t } = useTranslation()
  const { data: config } = useConfig()
  const save = useSaveConfig()
  const [draft, setDraft] = useState<DestinationConfig | null>(null)
  const [tests, setTests] = useState<Partial<Record<Kind, { success: boolean; message: string } | 'pending'>>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config && !draft) setDraft(config.destinations)
  }, [config, draft])

  if (!config || !draft) return <CenteredSpinner />

  function patch<K extends Kind>(kind: K, change: Partial<DestinationConfig[K]>) {
    setDraft({ ...draft!, [kind]: { ...draft![kind], ...change } })
  }

  async function test(kind: Kind) {
    setTests((prev) => ({ ...prev, [kind]: 'pending' }))
    const result = await window.electronAPI.testDestination(kind, draft![kind])
    setTests((prev) => ({ ...prev, [kind]: result }))
  }

  async function browse() {
    const picked = await window.electronAPI.browseFolder()
    if (picked) patch('local', { path: picked })
  }

  async function browseFile() {
    const picked = await window.electronAPI.browseFile()
    if (picked) patch('gcs', { credentialsFile: picked })
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(config.destinations)

  const result = (kind: Kind): ReactNode => {
    const r = tests[kind]
    if (!r) return null
    return r === 'pending' ? <Spinner /> : <Notice tone={r.success ? 'success' : 'error'}>{r.message}</Notice>
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <p className="px-1 text-[13.5px] text-surface-400">{t('settings.destinations.hint')}</p>

      <Destination title={t('settings.destinations.local')} hint={t('settings.destinations.localHint')} enabled={draft.local.enabled} onToggle={(v) => patch('local', { enabled: v })}>
        <Field label={t('settings.destinations.path')}>
          <div className="flex gap-2">
            <input className="input" value={draft.local.path} onChange={(e) => patch('local', { path: e.target.value })} />
            <button className="btn-secondary whitespace-nowrap" onClick={browse}>
              <FolderOpen size={14} />
              {t('settings.destinations.browse')}
            </button>
          </div>
        </Field>
        <TestRow onTest={() => test('local')}>{result('local')}</TestRow>
      </Destination>

      <Destination title={t('settings.destinations.s3')} hint={t('settings.destinations.s3Hint')} enabled={draft.s3.enabled} onToggle={(v) => patch('s3', { enabled: v })}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('settings.destinations.bucket')} value={draft.s3.bucket} onChange={(bucket) => patch('s3', { bucket })} />
          <TextField label={t('settings.destinations.region')} value={draft.s3.region} onChange={(region) => patch('s3', { region })} />
        </div>
        <TextField label={t('settings.destinations.endpoint')} value={draft.s3.endpoint} mono onChange={(endpoint) => patch('s3', { endpoint })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('settings.destinations.accessKey')} value={draft.s3.accessKeyId} mono onChange={(accessKeyId) => patch('s3', { accessKeyId })} />
          <SecretField label={t('settings.destinations.secretKey')} value={draft.s3.secretAccessKey} onChange={(secretAccessKey) => patch('s3', { secretAccessKey })} />
        </div>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-[14px] text-surface-100">{t('settings.destinations.pathStyle')}</span>
          <Switch label={t('settings.destinations.pathStyle')} checked={draft.s3.forcePathStyle} onChange={(forcePathStyle) => patch('s3', { forcePathStyle })} />
        </label>
        <TestRow onTest={() => test('s3')}>{result('s3')}</TestRow>
      </Destination>

      <Destination title={t('settings.destinations.gcs')} hint={t('settings.destinations.gcsHint')} enabled={draft.gcs.enabled} onToggle={(v) => patch('gcs', { enabled: v })}>
        <TextField label={t('settings.destinations.bucket')} value={draft.gcs.bucket} onChange={(bucket) => patch('gcs', { bucket })} />
        <Field label={t('settings.destinations.credentialsFile')}>
          <div className="flex gap-2">
            <input className="input font-mono text-[13px]" value={draft.gcs.credentialsFile} onChange={(e) => patch('gcs', { credentialsFile: e.target.value })} />
            <button className="btn-secondary whitespace-nowrap" onClick={browseFile}>
              {t('settings.destinations.browse')}
            </button>
          </div>
        </Field>
        <TestRow onTest={() => test('gcs')}>{result('gcs')}</TestRow>
      </Destination>

      <Destination title={t('settings.destinations.azure')} hint={t('settings.destinations.azureHint')} enabled={draft.azure.enabled} onToggle={(v) => patch('azure', { enabled: v })}>
        <TextField label={t('settings.destinations.container')} value={draft.azure.container} onChange={(container) => patch('azure', { container })} />
        <SecretField label={t('settings.destinations.connectionString')} value={draft.azure.connectionString} onChange={(connectionString) => patch('azure', { connectionString })} />
        <TestRow onTest={() => test('azure')}>{result('azure')}</TestRow>
      </Destination>

      <div className="flex justify-end">
        <button
          className="btn-primary"
          disabled={!dirty || save.isPending}
          onClick={async () => {
            await save.mutateAsync({ ...config, destinations: draft })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          }}
        >
          {saved ? t('common.saved') : t('settings.destinations.save')}
        </button>
      </div>
    </div>
  )
}

function Destination({
  title,
  hint,
  enabled,
  onToggle,
  children,
}: {
  title: string
  hint: string
  enabled: boolean
  onToggle: (value: boolean) => void
  children: ReactNode
}) {
  return (
    <div className="list-group">
      <label className="list-row cursor-pointer">
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-medium text-surface-100">{title}</span>
          <span className="block text-[12.5px] text-surface-500">{hint}</span>
        </span>
        <Switch label={title} checked={enabled} onChange={onToggle} />
      </label>
      {enabled && <div className="px-4 py-4 space-y-4">{children}</div>}
    </div>
  )
}

function TestRow({ onTest, children }: { onTest: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <button className="btn-secondary" onClick={onTest}>
        {t('settings.destinations.test')}
      </button>
      {children}
    </div>
  )
}
