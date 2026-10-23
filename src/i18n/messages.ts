import type { Language } from '../../electron/shared/languages'

/** Same shape as T, with every string leaf free to differ: used to force translations to cover every key. */
export type Translated<T> = { [K in keyof T]: T[K] extends string ? string : Translated<T[K]> }

/**
 * Languages whose plural rules split counts into one / few / many (i18next suffixes `_few`, `_many`).
 * Their translations must add both forms next to every English `_other` key.
 */
type FewManyLanguage = 'ru' | 'pl'

export type TranslatedFewMany<T> = { [K in keyof T]: T[K] extends string ? string : TranslatedFewMany<T[K]> } & {
  [K in keyof T as K extends `${infer Base}_other` ? `${Base}_few` | `${Base}_many` : never]: string
}

/** One feature's messages in every language: English is the source, the rest are typed against it. */
export type MessageCatalog<T> = { en: T } & { [L in Exclude<Language, 'en' | FewManyLanguage>]: Translated<T> } & {
  [L in FewManyLanguage]: TranslatedFewMany<T>
}

/**
 * Declares one feature's messages in all languages side by side. Each translation is typed against
 * the English object, so a missing or extra key (or a missing `_few`/`_many` plural) is a compile error.
 */
export function defineMessages<T extends Record<string, unknown>>(messages: { en: T } & MessageCatalog<NoInfer<T>>) {
  return messages as MessageCatalog<T>
}
