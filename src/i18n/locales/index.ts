import common from './common'
import nav from './nav'

/** Every feature's messages. Add new files here; both languages are derived from this list. */
const all = { common, nav }

type All = typeof all

export const en = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.en])) as {
  [K in keyof All]: All[K]['en']
}

export const ptBR = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.ptBR])) as {
  [K in keyof All]: All[K]['ptBR']
}
