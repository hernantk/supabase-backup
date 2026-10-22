import { classifySql, type SqlClassification } from '../../core/sqlClassify'
import { toQueryResult } from '../../core/queryResult'
import { appendAudit } from '../audit'
import { runPg } from './pgRunner'
import { projectContext, type ProjectContext } from './context'
import type { QueryResult, SqlRunOutcome } from '../../shared/managerApi'

/** Executes SQL against a project, through its account when it has one, else a direct connection. */
export async function executeSql(ctx: ProjectContext, sql: string, readOnly: boolean): Promise<QueryResult> {
  if (ctx.api && ctx.ref) {
    const started = Date.now()
    const rows = await ctx.api.runQuery(ctx.ref, sql, { readOnly })
    return toQueryResult(Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [], Date.now() - started)
  }
  const dbUrl = ctx.connection.supabase.dbUrl?.trim()
  if (dbUrl) return runPg(dbUrl, sql, readOnly)
  throw new Error('No way to reach this database: connect the project to an account, or set its Database URL in Settings.')
}

/** True when a protected project must ask the user before running this. */
export function needsConfirmation(ctx: ProjectContext, classification: SqlClassification, confirmed?: boolean): boolean {
  return !!ctx.connection.protected && classification.kind !== 'read' && !confirmed
}

export async function runSql(input: {
  connectionId: string
  sql: string
  readOnly: boolean
  confirmed?: boolean
}): Promise<SqlRunOutcome> {
  const ctx = projectContext(input.connectionId)
  const classification = classifySql(input.sql)

  if (input.readOnly && classification.kind !== 'read') {
    throw new Error(
      'Read-only mode is on, so this statement was not run. Turn read-only off to change data or the schema.'
    )
  }
  if (!input.readOnly && needsConfirmation(ctx, classification, input.confirmed)) {
    return { status: 'confirm', kind: classification.kind, reasons: classification.reasons }
  }

  const result = await executeSql(ctx, input.sql, input.readOnly)
  if (classification.kind !== 'read') {
    appendAudit({
      action: `sql.${classification.kind}`,
      project: ctx.connection.name,
      detail: input.sql,
    })
  }
  return { status: 'ok', kind: classification.kind, result }
}
