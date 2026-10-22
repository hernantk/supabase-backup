import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en'
import ptBR from './pt-BR'

export type Language = 'en' | 'pt-BR'
export type LanguagePreference = 'system' | Language

/** "system" follows the OS language: Portuguese systems get pt-BR, everything else English. */
export function resolveLanguage(preference: LanguagePreference): Language {
  if (preference !== 'system') return preference
  return (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
  lng: resolveLanguage('system'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function setLanguage(preference: LanguagePreference): void {
  void i18n.changeLanguage(resolveLanguage(preference))
}

export default i18n
