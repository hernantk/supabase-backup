import { dialog } from 'electron'
import fs from 'fs'
import { SCHEMA_COLUMNS_SQL } from '../../core/sqlBuilder'
import { diffSchemas } from '../../core/schemaDiff'
import { logsSql, logWindow, normalizeLogRows } from '../../core/logsQuery'
import { executeSql } from './sql'
import { projectContext, requireAccount } from './context'
import type {
  FunctionView,
  LogRow,
  LogSource,
  MigrationView,
  SchemaChange,
  SchemaColumn,
} from '../../shared/managerApi'

export async function listFunctions(connectionId: string): Promise<FunctionView[]> {
  const { api, ref } = requireAccount(projectContext(connectionId), 'Edge Functions')
  return (await api.listFunctions(ref))
    .map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      status: f.status,
      version: f.version,
      verifyJwt: f.verify_jwt !== false,
      updatedAt: f.updated_at ? new Date(f.updated_at).toISOString() : undefined,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

export async function downloadFunction(connectionId: string, slug: string): Promise<{ savedTo: string | null }> {
  const { api, ref } = requireAccount(projectContext(connectionId), 'Edge Functions')
  const target = await dialog.showSaveDialog({ defaultPath: `${slug}.bundle` })
  if (target.canceled || !target.filePath) return { savedTo: null }
  fs.writeFileSync(target.filePath, await api.getFunctionBody(ref, slug))
  return { savedTo: target.filePath }
}

export async function queryLogs(connectionId: string, source: LogSource, hours: number, search?: string): Promise<LogRow[]> {
  const { api, ref } = requireAccount(projectContext(connectionId), 'Logs')
  const { start, end } = logWindow(hours)
  const response = await api.queryLogs(ref, { sql: logsSql(source), start, end })
  if (response.error) {
    const message = typeof response.error === 'string' ? response.error : JSON.stringify(response.error)
    throw new Error(`The logs query failed: ${message.slice(0, 300)}`)
  }
  return normalizeLogRows(response.result, search)
}

export async function listMigrations(connectionId: string): Promise<MigrationView[]> {
  const { api, ref } = requireAccount(projectContext(connectionId), 'Migrations')
  return (await api.listMigrations(ref))
    .map((m) => ({ version: m.version, name: m.name }))
    .sort((a, b) => b.version.localeCompare(a.version))
}

export async function getSchema(connectionId: string): Promise<SchemaColumn[]> {
  const result = await executeSql(projectContext(connectionId), SCHEMA_COLUMNS_SQL, true)
  return result.rows.map((r) => ({
    schema: String(r.schema),
    table: String(r.table),
    column: String(r.column),
    type: String(r.type),
    nullable: r.nullable === true,
    default: r.default === null || r.default === undefined ? null : String(r.default),
  }))
}

export async function compareSchemas(left: string, right: string): Promise<SchemaChange[]> {
  const [a, b] = await Promise.all([getSchema(left), getSchema(right)])
  return diffSchemas(a, b)
}
