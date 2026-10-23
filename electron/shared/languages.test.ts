import { describe, it, expect } from 'vitest'
import { LANGUAGE_NAMES, LANGUAGES, matchLanguage, resolveLanguagePreference } from './languages'

describe('matchLanguage', () => {
  it('prefers an exact match, ignoring case and underscores', () => {
    expect(matchLanguage('pt-BR')).toBe('pt-BR')
    expect(matchLanguage('pt_pt')).toBe('pt-PT')
    expect(matchLanguage('ZH-cn')).toBe('zh-CN')
    expect(matchLanguage('de')).toBe('de')
  })

  it('falls back to the base language', () => {
    expect(matchLanguage('es-MX')).toBe('es')
    expect(matchLanguage('fr-CA')).toBe('fr')
    expect(matchLanguage('de-CH')).toBe('de')
    expect(matchLanguage('en-GB')).toBe('en')
    expect(matchLanguage('nl-BE')).toBe('nl')
  })

  it('maps every Chinese variant to Simplified Chinese and Portuguese by region', () => {
    expect(matchLanguage('zh')).toBe('zh-CN')
    expect(matchLanguage('zh-TW')).toBe('zh-CN')
    expect(matchLanguage('zh-Hans-SG')).toBe('zh-CN')
    expect(matchLanguage('pt')).toBe('pt-BR')
    expect(matchLanguage('pt-AO')).toBe('pt-PT')
  })

  it('falls back to English for anything else', () => {
    expect(matchLanguage('sv-SE')).toBe('en')
    expect(matchLanguage('')).toBe('en')
  })
})

describe('resolveLanguagePreference', () => {
  it('only looks at the locale for "system"', () => {
    expect(resolveLanguagePreference('system', 'ko-KR')).toBe('ko')
    expect(resolveLanguagePreference('it', 'ko-KR')).toBe('it')
  })
})

it('names every language', () => {
  expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual([...LANGUAGES].sort())
})
