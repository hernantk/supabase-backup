import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { type Language, type LanguagePreference, resolveLanguagePreference } from '../../electron/shared/languages'
import { messages } from './locales'

export type { Language, LanguagePreference }

/** "system" follows the OS language when the app is translated into it, and English otherwise. */
export function resolveLanguage(preference: LanguagePreference): Language {
  return resolveLanguagePreference(preference, typeof navigator !== 'undefined' ? navigator.language : 'en')
}

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(messages).map(([lang, translation]) => [lang, { translation }])),
  lng: resolveLanguage('system'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function setLanguage(preference: LanguagePreference): void {
  const language = resolveLanguage(preference)
  void i18n.changeLanguage(language)
  document.documentElement.lang = language
}

export default i18n
