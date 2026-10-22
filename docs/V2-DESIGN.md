# Supabase Manager 2.0 — design decisions

Outcome of the design interview. This file is the contract for the `v2` branch; change it
when a decision changes, not after the fact.

## Product

A local desktop **Supabase Manager** (Windows + Linux) with multi-account support, scheduled
backups and parallel backups of many projects. No server component, no telemetry.

| Area | Decision |
|---|---|
| Accounts | Supabase **Personal Access Token (PAT)** per account → Management API discovers orgs/projects. DB password is asked per project (the API never returns it). Standalone projects (service-role key + DB URL, no PAT) stay supported. |
| Manager scope, phase 1 | Projects (list / pause / restore / create / delete), SQL editor, Auth users, Storage browser, Secrets + API keys. |
| Manager scope, next | Table editor (right after phase 1). 2.1: Edge Functions, Logs/metrics, Migrations/schema, project cloning. |
| Backup content | Database (`pg_dump`, plain SQL + gzip) and Storage by default. Edge Function source and a JSON config snapshot are opt-in per project. |
| Parallel backups | Central job queue. Global concurrency (default 2, configurable). Never two jobs on the same project. Manual and scheduled runs share the queue. Batches report "N ok, M failed". |
| DB connection | User supplies the DB password; the app builds the **session pooler** URL (IPv4) from the Management API and falls back to the direct host. "Test connection" before saving. |
| Scheduling | Tray icon (closing the window keeps the app alive), optional start-with-OS, **catch-up** of runs missed while the PC was off. |
| Restore | Into any registered project (even another account), database and storage separately, confirmation by typing the project name. Project cloning is 2.1. |
| Destinations | Global destination profiles; each project picks which to use, with a per-account default. Layout `account/project/datetime`. Retention: keep last N per project. |
| Notifications | Webhook + native OS notification; a batch sends one summary. |

## Architecture

- Stay on **Electron + React + Vite + Tailwind**; the overhaul is internal structure.
- `electron/core/` — pure, unit-tested logic (job queue, secret codec, DB URL builder, catch-up).
- `electron/services/` — I/O (pg_dump, destinations, Management API, store).
- Secrets at rest use Electron `safeStorage`. PATs never reach the renderer: the renderer only
  sees account summaries; every Management API call runs in the main process.
- Persistence: JSON config (secrets encrypted) + SQLite (`better-sqlite3`) for history, jobs and
  logs. IPC contract is typed and shared; payloads validated with zod. TanStack Query in the UI.
- Safety rails for the Manager: per-project **protected** flag, SQL editor read-only by default,
  destructive actions require typing the resource name, local audit log of executed actions.
- UI shell: sidebar tree *account → projects*, per-project tabs (Overview, SQL, Auth, Storage,
  Backups, Secrets), global **Backups** center (queue, schedules, history). i18n en + pt-BR.

## Delivery

- Work happens on branch `v2`; `main` keeps producing 1.x until phase 1 is ready.
- Vitest for the pure logic: job queue, catch-up, v1→v2 migration, cron, secret codec, URL builder.
- Auto-update via `electron-updater` + GitHub Releases (can be turned off). Installers are unsigned.
- The v1 config/history is migrated automatically on first launch: every v1 connection becomes a
  standalone project; existing backups stay where they are.

## Phases

1. **Foundation** — job queue, per-job runner (no globals), config v2 + `safeStorage` + migration,
   Management API client, accounts. *(this branch, first commits)*
2. **Backups center** — batch backup UI, queue view, tray + catch-up scheduler, SQLite history.
3. **Manager phase 1** — projects, SQL, Auth, Storage, Secrets; UI shell rewrite; i18n.
4. **Restore to any project**, table editor, notifications rework, auto-update.
5. **2.1** — Edge Functions, Logs, Migrations, cloning, tiered retention.
