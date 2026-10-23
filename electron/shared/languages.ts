/**
 * Languages the app is translated into, shared by the renderer (i18next) and the main process
 * (tray, dialogs, notifications). English is the source language and the fallback.
 */
export const LANGUAGES = [
  'en',
  'pt-BR',
  'pt-PT',
  'es',
  'fr',
  'de',
  'it',
  'nl',
  'pl',
  'ru',
  'tr',
  'ja',
  'ko',
  'zh-CN',
  'hi',
] as const

export type Language = (typeof LANGUAGES)[number]
export type LanguagePreference = 'system' | Language

/** Each language in its own name, as the language picker shows it. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  ru: 'Русский',
  tr: 'Türkçe',
  ja: '日本語',
  ko: '한국어',
  'zh-CN': '简体中文',
  hi: 'हिन्दी',
}

export function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value)
}

/**
 * Picks the supported language closest to an OS or browser locale such as "es-MX": an exact match
 * first, then the base language. Chinese always gets Simplified Chinese; Portuguese outside Brazil
 * gets European Portuguese. Anything else falls back to English.
 */
export function matchLanguage(locale: string): Language {
  const tag = locale.trim().replace(/_/g, '-').toLowerCase()
  const exact = LANGUAGES.find((lang) => lang.toLowerCase() === tag)
  if (exact) return exact

  const [base, region] = tag.split('-')
  if (base === 'zh') return 'zh-CN'
  if (base === 'pt') return region && region !== 'br' ? 'pt-PT' : 'pt-BR'
  return LANGUAGES.find((lang) => lang === base) ?? 'en'
}

export function resolveLanguagePreference(preference: LanguagePreference, locale: string): Language {
  return preference === 'system' ? matchLanguage(locale) : preference
}
