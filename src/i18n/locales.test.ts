import { describe, it, expect } from 'vitest'
import { LANGUAGES } from '../../electron/shared/languages'
import { messages } from './locales'

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

/** Every string in a message tree, keyed by its dotted path. */
function flatten(tree: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [k, v] of flatten(value, path)) out.set(k, v)
  }
  return out
}

const placeholders = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()

/** The English string a translated key corresponds to; plural forms map to the English `_other`. */
function englishFor(en: Map<string, string>, key: string): string | undefined {
  return en.get(key) ?? en.get(key.replace(PLURAL_SUFFIX, '_other'))
}

const en = flatten(messages.en)

describe.each(LANGUAGES.filter((lang) => lang !== 'en'))('%s messages', (lang) => {
  const translated = flatten(messages[lang])

  it('keeps every placeholder of the English text', () => {
    const mismatches = [...translated]
      .filter(([key, text]) => placeholders(text).join() !== placeholders(englishFor(en, key) ?? '').join())
      .map(([key]) => key)
    expect(mismatches).toEqual([])
  })

  it('has every plural form the language uses for whole numbers', () => {
    const rules = new Intl.PluralRules(lang)
    const forms = new Set(Array.from({ length: 1001 }, (_, n) => rules.select(n)))
    const missing = [...en.keys()]
      .filter((key) => key.endsWith('_other'))
      .flatMap((key) => [...forms].map((form) => key.replace(/_other$/, `_${form}`)))
      .filter((key) => !translated.has(key))
    expect(missing).toEqual([])
  })

  it('has no empty strings', () => {
    expect([...translated].filter(([, text]) => text.trim() === '').map(([key]) => key)).toEqual([])
  })
})
