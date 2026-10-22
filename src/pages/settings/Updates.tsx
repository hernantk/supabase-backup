import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfig, useSaveConfig } from '../../hooks/useConfig'
import { ProgressBar } from '../../components/ProgressBar'
import { Section, Spinner, Switch } from '../../components/ui'
import type { UpdateState } from '../../../electron/preload'

export function Updates() {
  const { t } = useTranslation()
  const { data: config } = useConfig()
  const save = useSaveConfig()
  const [state, setState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => {
    window.electronAPI.getUpdateState().then(setState)
    return window.electronAPI.onUpdateState(setState)
  }, [])

  if (!config) return null

  const busy = state.status === 'checking' || state.status === 'downloading'
  const message =
    state.status === 'unsupported' ? t('settings.general.updateUnavailableDev')
    : state.status === 'none' ? t('settings.general.upToDate')
    : state.status === 'available' ? t('settings.general.updateAvailable', { version: state.version })
    : state.status === 'ready' ? t('settings.general.updateAvailable', { version: state.version })
    : state.status === 'error' ? t('settings.general.updateError', { error: state.error })
    : ''

  return (
    <Section title={t('settings.general.updates')}>
      <div className="list-group">
        <label className="list-row cursor-pointer">
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] text-surface-100">{t('settings.general.autoUpdate')}</span>
            <span className="block text-[12.5px] text-surface-500">{t('settings.general.autoUpdateHint')}</span>
          </span>
          <Switch
            label={t('settings.general.autoUpdate')}
            checked={config.settings.autoUpdate}
            onChange={(v) => save.mutate({ ...config, settings: { ...config.settings, autoUpdate: v } })}
          />
        </label>
        <div className="list-row justify-between gap-4">
          <div className="min-w-0 flex-1">
            {state.status === 'downloading' ? (
              <ProgressBar progress={state.percent ?? 0} label={t('settings.general.downloading', { percent: state.percent ?? 0 })} showPercentage={false} />
            ) : (
              <p className={`text-[13.5px] ${state.status === 'error' ? 'text-red-400' : 'text-surface-300'}`}>{message}</p>
            )}
          </div>
          {state.status === 'available' ? (
            <button className="btn-primary" onClick={() => window.electronAPI.downloadUpdate()}>
              {t('settings.general.downloadUpdate')}
            </button>
          ) : state.status === 'ready' ? (
            <button className="btn-primary" onClick={() => window.electronAPI.installUpdate()}>
              {t('settings.general.restartToInstall')}
            </button>
          ) : (
            <button className="btn-secondary" disabled={busy || state.status === 'unsupported'} onClick={() => window.electronAPI.checkForUpdates()}>
              {state.status === 'checking' && <Spinner className="!text-current" />}
              {state.status === 'checking' ? t('settings.general.checking') : t('settings.general.checkNow')}
            </button>
          )}
        </div>
      </div>
    </Section>
  )
}
