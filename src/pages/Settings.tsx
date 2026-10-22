import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/ui'
import { PgDumpSetup } from '../components/PgDumpSetup'
import { GeneralSettings } from './settings/General'
import { ConnectionsSettings } from './settings/Connections'
import { DestinationsSettings } from './settings/Destinations'
import { NotificationsSettings } from './settings/Notifications'

type Tab = 'general' | 'projects' | 'destinations' | 'notifications' | 'pgdump'
const TABS: Tab[] = ['general', 'projects', 'destinations', 'notifications', 'pgdump']

export function Settings() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('general')

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="segmented max-w-full overflow-x-auto" role="tablist">
        {TABS.map((key) => (
          <button key={key} role="tab" aria-selected={tab === key} className="segmented-item" onClick={() => setTab(key)}>
            {t(`settings.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralSettings />}
      {tab === 'projects' && <ConnectionsSettings />}
      {tab === 'destinations' && <DestinationsSettings />}
      {tab === 'notifications' && <NotificationsSettings />}
      {tab === 'pgdump' && (
        <div className="max-w-3xl">
          <PgDumpSetup />
        </div>
      )}
    </div>
  )
}
