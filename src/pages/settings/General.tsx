import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfig, useSaveConfig } from '../../hooks/useConfig'
import { CenteredSpinner, Section, Segmented, Switch } from '../../components/ui'
import { Updates } from './Updates'
import type { AppSettings } from '../../../electron/preload'
import { LANGUAGES, LANGUAGE_NAMES, type LanguagePreference } from '../../../electron/shared/languages'

export function GeneralSettings() {
  const { t } = useTranslation()
  const { data: config } = useConfig()
  const save = useSaveConfig()
  const [concurrency, setConcurrency] = useState('2')

  useEffect(() => {
    if (config) setConcurrency(String(config.settings.maxConcurrentBackups))
  }, [config?.settings.maxConcurrentBackups]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) return <CenteredSpinner />
  const { settings } = config

  // Every change on this tab is saved right away, like System Settings.
  const set = (patch: Partial<AppSettings>) => save.mutate({ ...config, settings: { ...settings, ...patch } })

  const toggles = [
    ['closeToTray', t('settings.general.closeToTray'), t('settings.general.closeToTrayHint')],
    ['startWithSystem', t('settings.general.startWithSystem'), t('settings.general.startWithSystemHint')],
    ['catchUpMissed', t('settings.general.catchUp'), t('settings.general.catchUpHint')],
  ] as const

  return (
    <div className="space-y-8 max-w-3xl">
      <Section title={t('settings.general.appearance')}>
        <div className="list-group">
          <div className="list-row justify-between">
            <span className="text-[14px] text-surface-100">{t('settings.general.theme')}</span>
            <Segmented
              label={t('settings.general.theme')}
              value={settings.appearance}
              onChange={(appearance) => set({ appearance })}
              options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`settings.general.themes.${v}`) }))}
            />
          </div>
          <div className="list-row justify-between">
            <span className="text-[14px] text-surface-100">{t('settings.general.language')}</span>
            <select
              className="input !w-auto"
              aria-label={t('settings.general.language')}
              value={settings.language}
              onChange={(e) => set({ language: e.target.value as LanguagePreference })}
            >
              <option value="system">{t('settings.general.languages.system')}</option>
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang} lang={lang}>
                  {LANGUAGE_NAMES[lang]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section title={t('settings.general.parallel')} footer={t('settings.general.parallelFooter')}>
        <div className="list-group">
          <div className="list-row">
            <div className="flex-1 min-w-0">
              <p className="text-[14px] text-surface-100">{t('settings.general.parallelLabel')}</p>
              <p className="text-[12.5px] text-surface-500">{t('settings.general.parallelHint')}</p>
            </div>
            <input
              type="number"
              min={1}
              max={16}
              className="input !w-20 text-right"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              onBlur={() => {
                const n = Math.min(16, Math.max(1, Math.floor(Number(concurrency) || 1)))
                setConcurrency(String(n))
                if (n !== settings.maxConcurrentBackups) set({ maxConcurrentBackups: n })
              }}
            />
          </div>
        </div>
      </Section>

      <Section title={t('settings.general.background')}>
        <div className="list-group">
          {toggles.map(([key, label, hint]) => (
            <label key={key} className="list-row cursor-pointer">
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] text-surface-100">{label}</span>
                <span className="block text-[12.5px] text-surface-500">{hint}</span>
              </span>
              <Switch label={label} checked={settings[key]} onChange={(v) => set({ [key]: v })} />
            </label>
          ))}
        </div>
      </Section>

      <Updates />
    </div>
  )
}
