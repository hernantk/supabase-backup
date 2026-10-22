import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfig, useSaveConfig } from '../../hooks/useConfig'
import { TextField } from '../../components/Field'
import { CenteredSpinner, Section, Switch } from '../../components/ui'
import type { AppConfig } from '../../../electron/preload'

export function NotificationsSettings() {
  const { t } = useTranslation()
  const { data: config } = useConfig()
  const save = useSaveConfig()
  const [draft, setDraft] = useState<AppConfig['notifications'] | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config && !draft) setDraft(config.notifications)
  }, [config, draft])

  if (!config || !draft) return <CenteredSpinner />
  const dirty = JSON.stringify(draft) !== JSON.stringify(config.notifications)

  return (
    <div className="space-y-8 max-w-3xl">
      <p className="px-1 text-[13.5px] text-surface-400">{t('settings.notifications.hint')}</p>

      <Section title={t('settings.notifications.native')} footer={t('settings.notifications.batchNote')}>
        <div className="list-group">
          <label className="list-row cursor-pointer">
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] text-surface-100">{t('settings.notifications.native')}</span>
              <span className="block text-[12.5px] text-surface-500">{t('settings.notifications.nativeHint')}</span>
            </span>
            <Switch label={t('settings.notifications.native')} checked={draft.native} onChange={(native) => setDraft({ ...draft, native })} />
          </label>
        </div>
      </Section>

      <Section title={t('settings.notifications.webhook')} footer={t('settings.notifications.webhookHint')}>
        <div className="list-group">
          <label className="list-row cursor-pointer">
            <span className="flex-1 text-[14px] text-surface-100">{t('settings.notifications.webhookEnabled')}</span>
            <Switch label={t('settings.notifications.webhookEnabled')} checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
          </label>
          {draft.enabled && (
            <>
              <div className="px-4 py-4">
                <TextField
                  label={t('settings.notifications.webhookUrl')}
                  value={draft.webhookUrl}
                  mono
                  placeholder="https://hooks.slack.com/services/…"
                  onChange={(webhookUrl) => setDraft({ ...draft, webhookUrl })}
                />
              </div>
              <label className="list-row cursor-pointer">
                <span className="flex-1 text-[14px] text-surface-100">{t('settings.notifications.onSuccess')}</span>
                <Switch label={t('settings.notifications.onSuccess')} checked={draft.onSuccess} onChange={(onSuccess) => setDraft({ ...draft, onSuccess })} />
              </label>
              <label className="list-row cursor-pointer">
                <span className="flex-1 text-[14px] text-surface-100">{t('settings.notifications.onFailure')}</span>
                <Switch label={t('settings.notifications.onFailure')} checked={draft.onFailure} onChange={(onFailure) => setDraft({ ...draft, onFailure })} />
              </label>
            </>
          )}
        </div>
      </Section>

      <div className="flex justify-end">
        <button
          className="btn-primary"
          disabled={!dirty || save.isPending}
          onClick={async () => {
            await save.mutateAsync({ ...config, notifications: draft })
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          }}
        >
          {saved ? t('common.saved') : t('settings.notifications.save')}
        </button>
      </div>
    </div>
  )
}
