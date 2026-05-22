# Supabase Backup

A cross-platform desktop application for backing up and restoring Supabase projects (PostgreSQL database + Storage buckets) to multiple destinations — Local, AWS S3, Google Cloud Storage, and Azure Blob Storage.

Built with **Electron + React + TypeScript + Vite**.

---

## Features

- Multiple named connections (back up several Supabase projects independently)
- Per-connection scheduled backups (cron-based, runs in the background)
- Destinations: Local folder, AWS S3 / S3-compatible, Google Cloud Storage, Azure Blob
- Compression (tar.gz) and AES-256 encryption
- Retention policy (keep last N backups per destination)
- Database restore with a destructive-action confirmation modal
- Bundled `pg_dump` / `psql` for Windows — no system PostgreSQL required
- Webhook notifications on success or failure
- Windows (NSIS installer) and Linux (AppImage, .deb) builds

---

## Requirements

| Tool | Version |
|---|---|
| Node.js | 18 or later |
| npm | 9 or later |
| Git | any |
| (Windows) pg_dump | auto-downloaded via the app, or installed via winget |
| (Linux) pg_dump | `sudo apt install postgresql-client-16` |

---

## Development

```bash
# 1. Clone the repository
git clone https://github.com/hernantk/supabase-backup.git
cd supabase-backup

# 2. Install dependencies
npm install

# 3. Run in development mode (hot reload)
npm run dev
```

The app opens an Electron window with Vite HMR. Changes to `src/` (React) rebuild instantly; changes to `electron/` require a full restart (`Ctrl+C`, then `npm run dev` again).

---

## Build

### Type-check only

```bash
npx tsc --noEmit
```

### Build renderer + Electron bundles (no installer)

```bash
npx vite build
```

Output:
- `dist/` — compiled React app
- `dist-electron/` — compiled Electron main process and preload

### Package as an installer

Requires **electron-builder** (already in devDependencies).

```bash
# Windows — produces a NSIS installer in release/
npm run build:win

# Linux — produces AppImage + .deb in release/
npm run build:linux

# Current platform
npm run build
```

> **Note for Windows builds:** `resources/icon.png` is automatically converted to `.ico` by electron-builder v25. No manual conversion needed.

> **Note for Linux:** `pg_dump` must be installed separately (e.g., `sudo apt install postgresql-client-16`). The app detects it from `$PATH` automatically.

### Bundling pg_dump (Windows)

The first time you open Settings → pg_dump on Windows, you can:

1. **Download automatically** — downloads the EnterpriseDB PostgreSQL 16 ZIP and extracts only `pg_dump.exe`, `psql.exe`, and the required DLLs (~15 MB) to `resources/pg_dump/win32/`.
2. **Install via winget** — runs `winget install PostgreSQL.PostgreSQL.16` silently.
3. **Point to an existing binary** — browse to any `pg_dump.exe` on your system.

To pre-bundle binaries before packaging, run the download once in dev mode and the files in `resources/pg_dump/win32/` will be included by `electron-builder` via `extraResources`.

---

## Project structure

```
supabase-backup/
├── electron/                  # Electron main process
│   ├── main.ts                # Entry point
│   ├── ipc.ts                 # All IPC handler registrations
│   ├── preload.ts             # Context bridge + shared TypeScript types
│   └── services/
│       ├── backup/
│       │   ├── database.ts    # pg_dump wrapper
│       │   ├── restore.ts     # psql restore wrapper
│       │   ├── runner.ts      # Backup orchestrator
│       │   └── storage.ts     # Supabase Storage downloader
│       ├── destinations/      # Local, S3, GCS, Azure providers
│       ├── config.ts          # Config store (electron-store)
│       ├── scheduler.ts       # Multi-connection cron scheduler
│       ├── pgDumpInstaller.ts # pg_dump detect / download / winget
│       ├── history.ts         # Backup history log
│       ├── logger.ts          # Structured logger
│       ├── compress.ts        # tar.gz compression
│       ├── encrypt.ts         # AES-256 encryption
│       ├── notify.ts          # Webhook notifications
│       └── retention.ts       # Retention policy
├── src/                       # React renderer
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── RunBackup.tsx
│   │   ├── Restore.tsx
│   │   ├── Settings.tsx
│   │   └── Logs.tsx
│   └── components/
├── resources/
│   ├── icon.png               # App icon (256×256, auto-converted to .ico for Windows)
│   └── pg_dump/
│       ├── win32/             # pg_dump.exe, psql.exe + DLLs (populated at runtime)
│       └── linux/             # pg_dump binary (if pre-bundled)
├── scripts/
│   └── generate-icon.js       # Generates resources/icon.png (pure Node.js, no deps)
├── electron-builder.yml       # Packaging config
├── vite.config.ts             # Vite config (renderer + electron builds)
└── LICENSE                    # Apache 2.0
```

---

## Configuration

User configuration is stored via `electron-store` in the OS config directory:

- **Windows:** `%APPDATA%\supabase-backup\config.json`
- **Linux:** `~/.config/supabase-backup/config.json`

Config is automatically migrated from older formats on startup.

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push and open a Pull Request

Please follow the existing code style (TypeScript strict, no `any` where avoidable).

---

## Support the project

If this tool saves you time or money, consider buying us a coffee:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-hernantk-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/hernantk)

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).
