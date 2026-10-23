import { describe, it, expect } from 'vitest'
import { batchNotificationText, resolveMainLanguage, translate, translateCount } from './mainMessages'

describe('translate', () => {
  it('fills placeholders and keeps unknown ones visible', () => {
    expect(translate('en', 'notify.backupOkBody', { name: 'Prod', size: '2 MB', duration: '3s' })).toBe('Prod · 2 MB in 3s')
    expect(translate('pt-BR', 'notify.backupOkBody', { name: 'Prod', size: '2 MB', duration: '3s' })).toBe('Prod · 2 MB em 3s')
    expect(translate('en', 'notify.backupFailedBody', { name: 'Prod' })).toBe('Prod: {error}')
  })
})

describe('resolveMainLanguage', () => {
  it('follows the OS locale only for "system"', () => {
    expect(resolveMainLanguage('system', 'pt-BR')).toBe('pt-BR')
    expect(resolveMainLanguage('system', 'pt-PT')).toBe('pt-PT')
    expect(resolveMainLanguage('system', 'es-MX')).toBe('es')
    expect(resolveMainLanguage('system', 'en-US')).toBe('en')
    expect(resolveMainLanguage('system', 'sv-SE')).toBe('en')
    expect(resolveMainLanguage('en', 'pt-BR')).toBe('en')
    expect(resolveMainLanguage('ja', 'en-US')).toBe('ja')
  })
})

describe('translateCount', () => {
  it('uses the plural form of the language', () => {
    expect(translateCount('en', 'quit.message', 1)).toBe('1 backup is still running or queued.')
    expect(translateCount('en', 'quit.message', 3)).toBe('3 backups are still running or queued.')
    expect(translateCount('ru', 'quit.message', 21)).toMatch(/^21 резервная копия/)
    expect(translateCount('ru', 'quit.message', 3)).toMatch(/^3 резервные копии/)
    expect(translateCount('ru', 'quit.message', 5)).toMatch(/^5 резервных копий/)
    expect(translateCount('pl', 'quit.message', 12)).toMatch(/^12 kopii zapasowych/)
    expect(translateCount('ja', 'quit.message', 1)).toBe('1 件のバックアップが実行中または待機中です。')
  })
})

describe('batchNotificationText', () => {
  it('summarises a fully successful batch in one line', () => {
    const text = batchNotificationText('en', { total: 4, succeeded: 4, failed: 0, cancelled: 0, failures: [] })
    expect(text).toEqual({ title: 'All 4 backups completed', body: '', ok: true })
  })

  it('lists failures and cancellations for a mixed batch', () => {
    const text = batchNotificationText('en', {
      total: 5,
      succeeded: 3,
      failed: 1,
      cancelled: 1,
      failures: [{ name: 'Staging', error: 'connection refused' }],
    })
    expect(text.ok).toBe(false)
    expect(text.title).toBe('3 of 5 backups completed')
    expect(text.body).toBe('Staging: connection refused\n1 cancelled')
  })

  it('caps the failure list and says how many were left out', () => {
    const failures = Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, error: 'x' }))
    const text = batchNotificationText('pt-BR', { total: 8, succeeded: 0, failed: 8, cancelled: 0, failures })
    expect(text.body.split('\n')).toHaveLength(6)
    expect(text.body).toContain('…e mais 3')
  })
})
