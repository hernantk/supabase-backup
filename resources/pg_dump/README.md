# pg_dump Binaries

Place the `pg_dump` binary for each platform in the respective directory:

- `win32/pg_dump.exe` — Windows binary (from PostgreSQL 16 installation)
- `linux/pg_dump` — Linux binary (from PostgreSQL 16 installation)

## How to obtain pg_dump

### Windows
1. Download PostgreSQL 16 from https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
2. Install (or extract the zip)
3. Copy `bin/pg_dump.exe` to `resources/pg_dump/win32/`
4. Also copy required DLLs: `libpq.dll`, `libintl-9.dll`, `libcrypto-3-x64.dll`, `libssl-3-x64.dll`, `libiconv-2.dll`

### Linux
1. Install PostgreSQL client: `sudo apt install postgresql-client-16`
2. Copy `/usr/bin/pg_dump` to `resources/pg_dump/linux/`

### Alternative: System pg_dump
If `pg_dump` is already installed on the system and available in PATH, the application will fall back to using it automatically.
