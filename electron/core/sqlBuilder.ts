/**
 * Builders for the table editor. Everything is produced as plain SQL text with identifiers quoted and
 * values escaped as string literals; PostgreSQL coerces `'42'` to the column type, so cells can be
 * edited as text whatever their type (json, uuid, arrays in `{a,b}` form, …).
 */

export function quoteIdent(name: string): string {
  if (!name || name.includes('\0')) throw new Error('Invalid identifier')
  return `"${name.replace(/"/g, '""')}"`
}

export function quoteLiteral(value: string): string {
  if (value.includes('\0')) throw new Error('Values cannot contain NUL characters')
  return `'${value.replace(/'/g, "''")}'`
}

export type CellValue = { kind: 'null' } | { kind: 'default' } | { kind: 'text'; value: string }

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'isnull' | 'notnull'

export interface RowFilter {
  column: string
  op: FilterOp
  value?: string
}

function qualified(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

function cell(value: CellValue): string {
  if (value.kind === 'null') return 'NULL'
  if (value.kind === 'default') return 'DEFAULT'
  return quoteLiteral(value.value)
}

export function buildFilter(filter: RowFilter): string {
  const column = quoteIdent(filter.column)
  const value = () => {
    if (filter.value === undefined) throw new Error(`The "${filter.op}" filter needs a value`)
    return quoteLiteral(filter.value)
  }
  switch (filter.op) {
    case 'eq': return `${column}::text = ${value()}`
    case 'neq': return `${column}::text <> ${value()}`
    case 'gt': return `${column} > ${value()}`
    case 'gte': return `${column} >= ${value()}`
    case 'lt': return `${column} < ${value()}`
    case 'lte': return `${column} <= ${value()}`
    case 'contains': {
      if (filter.value === undefined) throw new Error('The "contains" filter needs a value')
      const escaped = filter.value.replace(/[\\%_]/g, (c) => `\\${c}`)
      return `${column}::text ilike ${quoteLiteral(`%${escaped}%`)}`
    }
    case 'isnull': return `${column} is null`
    case 'notnull': return `${column} is not null`
  }
}

function whereOf(match: Record<string, string | null>): string {
  const entries = Object.entries(match)
  if (entries.length === 0) throw new Error('Refusing to build a statement without a row identifier')
  return entries
    .map(([column, value]) =>
      value === null ? `${quoteIdent(column)} is null` : `${quoteIdent(column)}::text = ${quoteLiteral(value)}`
    )
    .join(' and ')
}

export interface SelectOptions {
  schema: string
  table: string
  filter?: RowFilter
  orderBy?: string
  descending?: boolean
  limit: number
  offset: number
}

export function buildSelect(o: SelectOptions): string {
  const limit = Math.max(1, Math.min(1000, Math.floor(o.limit)))
  const offset = Math.max(0, Math.floor(o.offset))
  return [
    `select * from ${qualified(o.schema, o.table)}`,
    o.filter ? `where ${buildFilter(o.filter)}` : '',
    o.orderBy ? `order by ${quoteIdent(o.orderBy)} ${o.descending ? 'desc' : 'asc'}` : '',
    `limit ${limit} offset ${offset}`,
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildUpdate(o: {
  schema: string
  table: string
  set: Record<string, CellValue>
  match: Record<string, string | null>
}): string {
  const sets = Object.entries(o.set)
  if (sets.length === 0) throw new Error('Nothing to update')
  const assignments = sets.map(([column, value]) => `${quoteIdent(column)} = ${cell(value)}`).join(', ')
  return `update ${qualified(o.schema, o.table)} set ${assignments} where ${whereOf(o.match)} returning *`
}

export function buildInsert(o: { schema: string; table: string; values: Record<string, CellValue> }): string {
  const entries = Object.entries(o.values)
  if (entries.length === 0) return `insert into ${qualified(o.schema, o.table)} default values returning *`
  const columns = entries.map(([c]) => quoteIdent(c)).join(', ')
  const values = entries.map(([, v]) => cell(v)).join(', ')
  return `insert into ${qualified(o.schema, o.table)} (${columns}) values (${values}) returning *`
}

export function buildDelete(o: { schema: string; table: string; match: Record<string, string | null> }): string {
  return `delete from ${qualified(o.schema, o.table)} where ${whereOf(o.match)} returning *`
}

// ─── Catalog queries ──────────────────────────────────────────────────────────

export const LIST_TABLES_SQL = `
select n.nspname as schema, c.relname as name,
  case c.relkind when 'r' then 'table' when 'p' then 'table' when 'v' then 'view'
    when 'm' then 'materialized view' when 'f' then 'foreign table' end as kind,
  greatest(c.reltuples, 0)::bigint as estimated_rows,
  c.relrowsecurity as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'v', 'm', 'f')
  and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  and n.nspname not like 'pg_temp%'
order by (n.nspname = 'public') desc, n.nspname, c.relname`

export function describeTableSql(schema: string, table: string): string {
  return `
select a.attname as name,
  format_type(a.atttypid, a.atttypmod) as type,
  not a.attnotnull as nullable,
  pg_get_expr(d.adbin, d.adrelid) as "default",
  a.attidentity <> '' as identity,
  a.attgenerated <> '' as generated,
  coalesce(bool_or(i.indisprimary), false) as primary_key
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
left join pg_index i on i.indrelid = a.attrelid and i.indisprimary and a.attnum = any(i.indkey)
where n.nspname = ${quoteLiteral(schema)} and c.relname = ${quoteLiteral(table)}
  and a.attnum > 0 and not a.attisdropped
group by a.attnum, a.attname, a.atttypid, a.atttypmod, a.attnotnull, d.adbin, d.adrelid, a.attidentity, a.attgenerated
order by a.attnum`
}

/** One row per column of every user table: the input of the schema diff. */
export const SCHEMA_COLUMNS_SQL = `
select table_schema as schema, table_name as "table", column_name as "column",
  data_type as type, is_nullable = 'YES' as nullable, column_default as "default"
from information_schema.columns
where table_schema not in ('pg_catalog', 'information_schema', 'pg_toast')
  and table_schema not like 'pg_temp%'
order by table_schema, table_name, ordinal_position`
