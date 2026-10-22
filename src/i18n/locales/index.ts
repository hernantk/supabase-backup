import common from './common'
import nav from './nav'
import projects from './projects'
import sql from './sql'
import authUsers from './authUsers'
import storage from './storage'
import secrets from './secrets'
import backups from './backups'
import dashboard from './dashboard'
import logs from './logs'
import accounts from './accounts'
import miniProgress from './miniProgress'
import settings from './settings'
import restore from './restore'
import tableEditor from './tables'
import insights from './insights'

/** Every feature's messages. Add new files here; both languages are derived from this list. */
const all = { common, nav, projects, sql, authUsers, storage, secrets, backups, dashboard, logs, accounts, miniProgress, settings, restore, tableEditor, insights }

type All = typeof all

export const en = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.en])) as {
  [K in keyof All]: All[K]['en']
}

export const ptBR = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.ptBR])) as {
  [K in keyof All]: All[K]['ptBR']
}
