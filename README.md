# Supabase Backup — Manager 2.0

A local, multi-account **Supabase Manager** for Windows and Linux, with scheduled and parallel backups.
Everything runs on your computer: no server, no telemetry. Tokens and keys are encrypted with the OS keychain.

Built with **Electron + React + TypeScript + Vite**. Light and dark themes follow the system; the UI is available in 15 languages (English, Portuguese (Brazil and Portugal), Spanish, French, German, Italian, Dutch, Polish, Russian, Turkish, Japanese, Korean, Simplified Chinese and Hindi) and follows the system language by default.

---

## What it does

**Accounts and projects**
- Connect several Supabase accounts with a personal access token; import their projects in one click.
- Standalone projects (service-role key and database URL, no account) keep working.
- Sidebar tree *account → projects* with live status; create, pause, restore and delete projects.

**Backups**
- Back up many projects **at the same time** (configurable concurrency); the same project never runs twice at once.
- Queue with per-job progress, cancel one job or a whole batch, one summary notification per batch.
- Scheduled backups per project (cron), running in the tray; **missed runs are caught up** when the PC was off or asleep.
- Content: database (`pg_dump`), Storage files, Edge Functions and project configuration (secret *names* only).
- Destinations: local folder, AWS S3 / S3-compatible, Google Cloud Storage, Azure Blob. Compression, AES-256 encryption.
- Retention: keep the last *N*, or layered (last *N* + one per day/week/month).

**Restore**
- Restore into **any** registered project, even one in another account; database and storage separately.
- Or restore into a **new project**: it is created, and the backup is restored as soon as it is ready.
- Typed-name confirmation, encrypted backups supported.

**Manager** (per project)
- **SQL editor** — read-only by default (enforced by the database), history, saved queries, CSV/JSON export.
- **Table editor** — browse, sort, filter, edit cells, insert and delete rows.
- **Auth** users, **Storage** browser, **Edge Functions**, **Logs**, **Schema** (tables, migrations, diff between two projects), **Secrets** and API keys.
- **Protected projects**: writes and destructive statements ask for confirmation (destructive ones need the project name). Everything the Manager changes is recorded in Activity.

---

## Requirements

| Tool | Version |
|---|---|
| Node.js | 18 or later (22 recommended) |
| npm | 9 or later |
| `pg_dump` / `psql` | detected automatically; on Windows the app can download them or install via winget |

On Linux install the PostgreSQL client yourself (`sudo apt install postgresql-client-16`).

---

## Development

```bash
git clone https://github.com/hernantk/supabase-backup.git
cd supabase-backup
npm install
npm run electron:dev     # Vite + Electron with hot reload
```

Useful scripts:

```bash
npm run typecheck        # tsc --noEmit
npm test                 # unit tests (Vitest)
npm run icon             # regenerates resources/icon.png and the SVG icon
npm run build            # type-check, build, package installers into release/
```

> `electron:dev` waits for the dev server on port 5173. If another dev server already uses that port,
> Vite moves to the next one and Electron follows it through `VITE_DEV_SERVER_URL`.

### Project structure

```
electron/
  main.ts, ipc.ts, preload.ts      entry, IPC registration, typed bridge
  ipc/managerRoutes.ts             Manager API: one typed channel, every payload validated with zod
  shared/managerApi.ts             the Manager contract (types only, shared with the renderer)
  core/                            pure, unit-tested logic: job queue, retention, SQL classifier/builder,
                                   catch-up, schema diff, config migration, secret codec, …
  services/
    backup/                        runner (no global state), backupService (queue), restore, storage, pg_dump
    manager/                       projects, SQL, tables, auth, storage, secrets, insights
    supabase/                      Management API client, accounts
    destinations/                  local, S3, GCS, Azure
    scheduler.ts, tray.ts, notify.ts, updater.ts, audit.ts, …
src/
  pages/                           Dashboard, Projects, project/* (workspace tabs), Backups, Restore,
                                   Accounts, Settings, Activity
  components/, hooks/, lib/, i18n/ UI primitives, TanStack Query hooks, typed messages in every language
docs/V2-DESIGN.md                  design decisions
```

See [docs/V2-DESIGN.md](docs/V2-DESIGN.md) for the reasoning behind the architecture.

---

## Packaging and releases

```bash
npm run build            # Windows: NSIS installer; Linux: AppImage + .deb  →  release/
```

Pushing a tag `v*` runs the **Build and Release** workflow, which builds Windows and Linux installers and
attaches them (plus `latest*.yml` for the updater) to a GitHub release. Installed apps check that release
on start (Settings → General → Updates) and only download or install after you confirm. Installers are not
code-signed, so Windows SmartScreen may warn on first run.

---

## Data and security

- Config: `%APPDATA%\supabase-backup\config.json` (Windows) / `~/.config/supabase-backup/config.json` (Linux).
  Secrets inside it (service-role keys, database URLs, passwords, webhook URLs) and the account tokens are
  encrypted with Electron `safeStorage` (DPAPI, Keychain or libsecret). Without a keyring on Linux the app
  cannot protect them and says so instead of pretending.
- Account tokens never reach the renderer: every Management API call runs in the main process.
- The Manager's audit log is `audit.log` next to the config; it is local and append-only.
- Upgrading from 1.x is automatic: each connection becomes a standalone project and keeps its schedule.

---

## Known limits

- Layered retention and catch-up work per project and per destination; they do not look across destinations.
- Backup history is kept in `electron-store` (last 100 runs), not in a database.
- Edge Function and configuration backups are archives for reference; restoring them is not automated.
- SQL and the table editor cannot reach a standalone project without a database URL.

---

## Contributing

Pull requests are welcome. For larger changes please open an issue first.

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Run `npm run typecheck && npm test` before pushing
3. Open a pull request

## Support the project

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-hernantk-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/hernantk)

## License

Apache 2.0 — see [LICENSE](./LICENSE).
