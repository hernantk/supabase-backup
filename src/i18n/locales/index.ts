import { LANGUAGES, type Language } from '../../../electron/shared/languages'
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
import pgdump from './pgdump'

/** Every feature's messages. Add new files here; every language is derived from this list. */
const all = { common, nav, projects, sql, authUsers, storage, secrets, backups, dashboard, logs, accounts, miniProgress, settings, restore, tableEditor, insights, pgdump }

type All = typeof all

/** The full message tree of each language, keyed by language code. */
export const messages = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, Object.fromEntries(Object.entries(all).map(([feature, catalog]) => [feature, catalog[lang]]))]),
) as { [L in Language]: { [K in keyof All]: All[K][L] } }
