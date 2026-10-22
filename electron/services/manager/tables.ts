import { classifySql } from '../../core/sqlClassify'
import {
  buildDelete,
  buildInsert,
  buildSelect,
  buildUpdate,
  describeTableSql,
  LIST_TABLES_SQL,
  type CellValue,
  type RowFilter,
} from '../../core/sqlBuilder'
import { appendAudit } from '../audit'
import { executeSql, needsConfirmation } from './sql'
import { projectContext } from './context'
import type { ColumnInfo, MutationOutcome, TableInfo, TablePage } from '../../shared/managerApi'

export async function listTables(connectionId: string): Promise<TableInfo[]> {
  const ctx = projectContext(connectionId)
  const result = await executeSql(ctx, LIST_TABLES_SQL, true)
  return result.rows.map((r) => ({
    schema: String(r.schema),
    name: String(r.name),
    kind: r.kind as TableInfo['kind'],
    estimatedRows: Number(r.estimated_rows ?? 0),
    rls: r.rls === true,
  }))
}

async function describe(connectionId: string, schema: string, table: string): Promise<ColumnInfo[]> {
  const ctx = projectContext(connectionId)
  const result = await executeSql(ctx, describeTableSql(schema, table), true)
  return result.rows.map((r) => ({
    name: String(r.name),
    type: String(r.type),
    nullable: r.nullable === true,
    default: r.default === null || r.default === undefined ? null : String(r.default),
    identity: r.identity === true,
    generated: r.generated === true,
    primaryKey: r.primary_key === true,
  }))
}

export async function readRows(input: {
  connectionId: string
  schema: string
  table: string
  limit: number
  offset: number
  orderBy?: string
  descending?: boolean
  filter?: RowFilter
}): Promise<TablePage> {
  const ctx = projectContext(input.connectionId)
  const columns = await describe(input.connectionId, input.schema, input.table)
  if (columns.length === 0) throw new Error(`Table "${input.schema}.${input.table}" was not found.`)
  if (input.orderBy && !columns.some((c) => c.name === input.orderBy)) throw new Error('Unknown sort column.')
  if (input.filter && !columns.some((c) => c.name === input.filter!.column)) throw new Error('Unknown filter column.')

  // One extra row tells us whether there is a next page without a (slow) count(*).
  const sql = buildSelect({ ...input, limit: input.limit + 1 })
  const result = await executeSql(ctx, sql, true)
  const hasMore = result.rows.length > input.limit
  return { columns, rows: result.rows.slice(0, input.limit), hasMore }
}

/** Shared path for insert/update/delete: protected-project confirmation, execution, audit. */
async function mutate<T>(
  connectionId: string,
  action: string,
  sql: string,
  confirmed: boolean | undefined,
  pick: (rows: Record<string, unknown>[]) => T
): Promise<MutationOutcome<T>> {
  const ctx = projectContext(connectionId)
  const classification = classifySql(sql)
  if (needsConfirmation(ctx, classification, confirmed)) {
    return { status: 'confirm', reasons: classification.reasons }
  }
  const result = await executeSql(ctx, sql, false)
  appendAudit({ action, project: ctx.connection.name, detail: sql })
  return { status: 'ok', value: pick(result.rows) }
}

export function updateRow(input: {
  connectionId: string
  schema: string
  table: string
  match: Record<string, string | null>
  set: Record<string, CellValue>
  confirmed?: boolean
}): Promise<MutationOutcome<Record<string, unknown> | null>> {
  return mutate(input.connectionId, 'table.update', buildUpdate(input), input.confirmed, (rows) => rows[0] ?? null)
}

export function insertRow(input: {
  connectionId: string
  schema: string
  table: string
  values: Record<string, CellValue>
  confirmed?: boolean
}): Promise<MutationOutcome<Record<string, unknown> | null>> {
  return mutate(input.connectionId, 'table.insert', buildInsert(input), input.confirmed, (rows) => rows[0] ?? null)
}

export function deleteRow(input: {
  connectionId: string
  schema: string
  table: string
  match: Record<string, string | null>
  confirmed?: boolean
}): Promise<MutationOutcome<number>> {
  return mutate(input.connectionId, 'table.delete', buildDelete(input), input.confirmed, (rows) => rows.length)
}
