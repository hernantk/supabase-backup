export type SqlKind = 'read' | 'write' | 'ddl' | 'destructive'

export interface SqlClassification {
  kind: SqlKind
  /** Human-readable reasons the statement is not a plain read (for confirmation dialogs). */
  reasons: string[]
  statementCount: number
}

const SEVERITY: Record<SqlKind, number> = { read: 0, write: 1, ddl: 2, destructive: 3 }

/** Removes comments and string/identifier contents so keywords inside them are not mistaken for SQL. */
export function stripSql(sql: string): string {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]

    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2 }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2 }
        else i++
      }
      out += ' '
      continue
    }
    if (c === "'" || c === '"') {
      const quote = c
      i++
      while (i < sql.length) {
        if (sql[i] === quote && sql[i + 1] === quote) i += 2
        else if (sql[i] === quote) { i++; break }
        else i++
      }
      out += quote + quote
      continue
    }
    if (c === '$') {
      // dollar-quoted string: $tag$ ... $tag$
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (m) {
        const end = sql.indexOf(m[0], i + m[0].length)
        i = end === -1 ? sql.length : end + m[0].length
        out += "''"
        continue
      }
    }
    out += c
    i++
  }
  return out
}

function classifyStatement(statement: string): { kind: SqlKind; reasons: string[] } {
  const s = statement.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return { kind: 'read', reasons: [] }
  const first = s.split(/[\s(]/)[0]
  const hasWhere = /\bwhere\b/.test(s)

  switch (first) {
    case 'select': {
      if (/\binto\b(?!\s*\()/.test(s) && /^select\b[^;]*\binto\s+(temp|temporary|unlogged)?\s*(table\s+)?[a-z_"]/.test(s)) {
        return { kind: 'ddl', reasons: ['SELECT … INTO creates a table'] }
      }
      if (/\bfor (update|share|no key update)\b/.test(s)) return { kind: 'write', reasons: ['SELECT … FOR UPDATE takes row locks'] }
      return { kind: 'read', reasons: [] }
    }
    case 'show':
    case 'values':
    case 'table':
    case 'fetch':
      return { kind: 'read', reasons: [] }
    case 'explain':
      return /\banalyze\b/.test(s)
        ? { kind: 'write', reasons: ['EXPLAIN ANALYZE executes the statement'] }
        : { kind: 'read', reasons: [] }
    case 'with': {
      if (/\b(insert\s+into|update\s+[a-z_".]+\s+set|delete\s+from|merge\s+into)\b/.test(s)) {
        return { kind: 'write', reasons: ['The query modifies data inside a WITH clause'] }
      }
      return { kind: 'read', reasons: [] }
    }
    case 'insert':
    case 'copy':
    case 'call':
    case 'do':
    case 'merge':
    case 'lock':
    case 'refresh':
    case 'vacuum':
    case 'analyze':
    case 'reindex':
    case 'cluster':
    case 'listen':
    case 'notify':
      return { kind: 'write', reasons: [`${first.toUpperCase()} changes data or state`] }
    case 'update':
      return hasWhere
        ? { kind: 'write', reasons: ['UPDATE changes rows'] }
        : { kind: 'destructive', reasons: ['UPDATE without WHERE changes every row'] }
    case 'delete':
      return hasWhere
        ? { kind: 'write', reasons: ['DELETE removes rows'] }
        : { kind: 'destructive', reasons: ['DELETE without WHERE removes every row'] }
    case 'truncate':
      return { kind: 'destructive', reasons: ['TRUNCATE removes every row'] }
    case 'drop':
      return { kind: 'destructive', reasons: ['DROP permanently removes objects'] }
    case 'alter':
      return /\bdrop\b/.test(s)
        ? { kind: 'destructive', reasons: ['ALTER … DROP removes columns or constraints'] }
        : { kind: 'ddl', reasons: ['ALTER changes the schema'] }
    case 'create':
    case 'grant':
    case 'revoke':
    case 'comment':
    case 'security':
    case 'reassign':
    case 'rename':
      return { kind: 'ddl', reasons: [`${first.toUpperCase()} changes the schema or permissions`] }
    case 'begin':
    case 'commit':
    case 'rollback':
    case 'set':
    case 'reset':
    case 'savepoint':
    case 'release':
    case 'start':
      return { kind: 'read', reasons: [] }
    default:
      // Unknown verbs are treated as writes: asking once too often is cheaper than a silent change.
      return { kind: 'write', reasons: [`Unrecognised statement "${first}"`] }
  }
}

/** Heuristic classification used for the read-only guard and the "protected project" confirmation. */
export function classifySql(sql: string): SqlClassification {
  const statements = stripSql(sql)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  let kind: SqlKind = 'read'
  const reasons = new Set<string>()
  for (const statement of statements) {
    const result = classifyStatement(statement)
    if (SEVERITY[result.kind] > SEVERITY[kind]) kind = result.kind
    result.reasons.forEach((r) => reasons.add(r))
  }
  return { kind, reasons: [...reasons], statementCount: statements.length }
}
