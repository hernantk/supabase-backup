import { describe, it, expect } from 'vitest'
import { diffSchemas } from './schemaDiff'
import type { SchemaColumn } from '../shared/managerApi'

const col = (table: string, column: string, type = 'text', nullable = true, def: string | null = null, schema = 'public'): SchemaColumn => ({
  schema, table, column, type, nullable, default: def,
})

describe('diffSchemas', () => {
  it('reports nothing for identical schemas', () => {
    const s = [col('users', 'id', 'uuid', false), col('users', 'email')]
    expect(diffSchemas(s, [...s])).toEqual([])
  })

  it('finds tables that exist on only one side', () => {
    const changes = diffSchemas([col('a', 'id'), col('only_left', 'id')], [col('a', 'id'), col('only_right', 'id')])
    expect(changes).toEqual([
      { kind: 'table-removed', schema: 'public', table: 'only_left' },
      { kind: 'table-added', schema: 'public', table: 'only_right' },
    ])
  })

  it('finds added, removed and changed columns in a shared table', () => {
    const left = [col('users', 'id', 'uuid', false), col('users', 'legacy'), col('users', 'age', 'integer')]
    const right = [col('users', 'id', 'uuid', false), col('users', 'nickname'), col('users', 'age', 'bigint')]
    expect(diffSchemas(left, right)).toEqual([
      { kind: 'column-changed', schema: 'public', table: 'users', column: 'age', from: 'integer', to: 'bigint' },
      { kind: 'column-removed', schema: 'public', table: 'users', column: 'legacy', type: 'text' },
      { kind: 'column-added', schema: 'public', table: 'users', column: 'nickname', type: 'text' },
    ])
  })

  it('treats nullability and defaults as part of a column', () => {
    const changes = diffSchemas([col('t', 'c', 'text', true)], [col('t', 'c', 'text', false, "'x'::text")])
    expect(changes).toEqual([
      { kind: 'column-changed', schema: 'public', table: 't', column: 'c', from: 'text', to: "text not null default 'x'::text" },
    ])
  })

  it('keeps tables of different schemas apart', () => {
    const changes = diffSchemas([col('t', 'id', 'text', true, null, 'public')], [col('t', 'id', 'text', true, null, 'archive')])
    expect(changes.map((c) => c.kind)).toEqual(['table-added', 'table-removed'])
  })
})
