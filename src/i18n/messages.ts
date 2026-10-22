/** Same shape as T, with every string leaf free to differ: used to force translations to cover every key. */
export type Translated<T> = { [K in keyof T]: T[K] extends string ? string : Translated<T[K]> }

/**
 * Declares one feature's messages in both languages side by side. The Portuguese object is typed
 * against the English one, so a missing or extra key is a compile error.
 */
export function defineMessages<T extends Record<string, unknown>>(en: T, ptBR: Translated<T>) {
  return { en, ptBR }
}
