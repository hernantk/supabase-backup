import type { SchemaChange, SchemaColumn } from '../shared/managerApi'

function describeColumn(c: SchemaColumn): string {
  return `${c.type}${c.nullable ? '' : ' not null'}${c.default ? ` default ${c.default}` : ''}`
}

/**
 * Differences between two schemas, from `left` to `right`:
 * "removed" things exist only on the left, "added" things only on the right.
 */
export function diffSchemas(left: SchemaColumn[], right: SchemaColumn[]): SchemaChange[] {
  const group = (columns: SchemaColumn[]) => {
    const tables = new Map<string, Map<string, SchemaColumn>>()
    for (const c of columns) {
      const key = `${c.schema}.${c.table}`
      if (!tables.has(key)) tables.set(key, new Map())
      tables.get(key)!.set(c.column, c)
    }
    return tables
  }
  const l = group(left)
  const r = group(right)
  const changes: SchemaChange[] = []

  const split = (key: string) => {
    const dot = key.indexOf('.')
    return { schema: key.slice(0, dot), table: key.slice(dot + 1) }
  }

  for (const key of [...new Set([...l.keys(), ...r.keys()])].sort()) {
    const { schema, table } = split(key)
    const lt = l.get(key)
    const rt = r.get(key)

    if (lt && !rt) {
      changes.push({ kind: 'table-removed', schema, table })
      continue
    }
    if (!lt && rt) {
      changes.push({ kind: 'table-added', schema, table })
      continue
    }

    for (const name of [...new Set([...lt!.keys(), ...rt!.keys()])].sort()) {
      const a = lt!.get(name)
      const b = rt!.get(name)
      if (a && !b) changes.push({ kind: 'column-removed', schema, table, column: name, type: a.type })
      else if (!a && b) changes.push({ kind: 'column-added', schema, table, column: name, type: b.type })
      else if (a && b && describeColumn(a) !== describeColumn(b)) {
        changes.push({ kind: 'column-changed', schema, table, column: name, from: describeColumn(a), to: describeColumn(b) })
      }
    }
  }
  return changes
}
