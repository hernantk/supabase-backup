import { describe, it, expect } from 'vitest'
import { batchNotificationText, resolveMainLanguage, translate } from './mainMessages'

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
    expect(resolveMainLanguage('system', 'pt-PT')).toBe('pt-BR')
    expect(resolveMainLanguage('system', 'en-US')).toBe('en')
    expect(resolveMainLanguage('en', 'pt-BR')).toBe('en')
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
