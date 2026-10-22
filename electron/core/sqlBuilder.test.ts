import { describe, it, expect } from 'vitest'
import {
  buildDelete,
  buildFilter,
  buildInsert,
  buildSelect,
  buildUpdate,
  describeTableSql,
  quoteIdent,
  quoteLiteral,
} from './sqlBuilder'

describe('quoting', () => {
  it('doubles embedded quotes in identifiers and literals', () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"')
    expect(quoteLiteral("o'brien")).toBe("'o''brien'")
  })

  it('refuses empty identifiers and NUL characters', () => {
    expect(() => quoteIdent('')).toThrow()
    expect(() => quoteLiteral('a\0b')).toThrow()
  })

  it('neutralises classic injection payloads', () => {
    expect(quoteLiteral("x'; drop table users; --")).toBe("'x''; drop table users; --'")
    expect(quoteIdent('t"; drop table users; --')).toBe('"t""; drop table users; --"')
  })
})

describe('buildSelect', () => {
  it('builds a paginated, ordered query', () => {
    expect(
      buildSelect({ schema: 'public', table: 'users', orderBy: 'created_at', descending: true, limit: 50, offset: 100 })
    ).toBe('select * from "public"."users" order by "created_at" desc limit 50 offset 100')
  })

  it('applies a filter and clamps limit and offset', () => {
    expect(
      buildSelect({ schema: 's', table: 't', filter: { column: 'email', op: 'contains', value: '50%_off' }, limit: 99999, offset: -5 })
    ).toBe(`select * from "s"."t" where "email"::text ilike '%50\\%\\_off%' limit 1000 offset 0`)
  })
})

describe('buildFilter', () => {
  it('covers each operator', () => {
    expect(buildFilter({ column: 'a', op: 'eq', value: '1' })).toBe(`"a"::text = '1'`)
    expect(buildFilter({ column: 'a', op: 'gte', value: '5' })).toBe(`"a" >= '5'`)
    expect(buildFilter({ column: 'a', op: 'isnull' })).toBe('"a" is null')
    expect(buildFilter({ column: 'a', op: 'notnull' })).toBe('"a" is not null')
  })

  it('requires a value for comparison operators', () => {
    expect(() => buildFilter({ column: 'a', op: 'eq' })).toThrow(/needs a value/)
  })
})

describe('row mutations', () => {
  it('updates by primary key, mixing text, NULL and DEFAULT', () => {
    expect(
      buildUpdate({
        schema: 'public',
        table: 'users',
        set: { name: { kind: 'text', value: "O'Neil" }, bio: { kind: 'null' }, role: { kind: 'default' } },
        match: { id: '7' },
      })
    ).toBe(`update "public"."users" set "name" = 'O''Neil', "bio" = NULL, "role" = DEFAULT where "id"::text = '7' returning *`)
  })

  it('supports composite and null-valued keys', () => {
    expect(buildDelete({ schema: 's', table: 't', match: { a: '1', b: null } })).toBe(
      `delete from "s"."t" where "a"::text = '1' and "b" is null returning *`
    )
  })

  it('refuses to update or delete without a row identifier', () => {
    expect(() => buildDelete({ schema: 's', table: 't', match: {} })).toThrow(/row identifier/)
    expect(() => buildUpdate({ schema: 's', table: 't', set: { a: { kind: 'null' } }, match: {} })).toThrow(/row identifier/)
  })

  it('refuses an update with nothing to set', () => {
    expect(() => buildUpdate({ schema: 's', table: 't', set: {}, match: { id: '1' } })).toThrow(/Nothing to update/)
  })

  it('inserts values, or default values when none are given', () => {
    expect(buildInsert({ schema: 's', table: 't', values: { a: { kind: 'text', value: '1' }, b: { kind: 'default' } } })).toBe(
      `insert into "s"."t" ("a", "b") values ('1', DEFAULT) returning *`
    )
    expect(buildInsert({ schema: 's', table: 't', values: {} })).toBe('insert into "s"."t" default values returning *')
  })
})

describe('describeTableSql', () => {
  it('embeds the table name as an escaped literal', () => {
    expect(describeTableSql('public', "o'x")).toContain("c.relname = 'o''x'")
  })
})
