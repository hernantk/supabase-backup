import { describe, it, expect } from 'vitest'
import { classifySql, stripSql } from './sqlClassify'

const kind = (sql: string) => classifySql(sql).kind

describe('stripSql', () => {
  it('removes comments and hides string contents', () => {
    expect(stripSql("select 'drop table x' -- delete from y\n, 1")).not.toMatch(/drop|delete/)
    expect(stripSql('select 1 /* truncate t */ ')).not.toMatch(/truncate/)
    expect(stripSql('select $$drop table$$')).not.toMatch(/drop/)
    expect(stripSql('select $fn$ delete from x $fn$')).not.toMatch(/delete/)
  })

  it('handles doubled quotes and nested block comments', () => {
    expect(stripSql("select 'it''s drop'")).not.toMatch(/drop/)
    expect(stripSql('select /* a /* b */ drop */ 1')).not.toMatch(/drop/)
  })
})

describe('classifySql', () => {
  it.each([
    'select * from users',
    '  SELECT 1;',
    'show server_version',
    'explain select * from t',
    'with a as (select 1) select * from a',
    "select 'delete from x'",
    '-- drop table x\nselect 1',
    'values (1), (2)',
  ])('treats %j as a read', (sql) => {
    expect(kind(sql)).toBe('read')
  })

  it.each([
    ['insert into t values (1)', 'write'],
    ['update t set a = 1 where id = 2', 'write'],
    ['delete from t where id = 2', 'write'],
    ['copy t from stdin', 'write'],
    ['with d as (delete from t where true returning *) select * from d', 'write'],
    ['explain analyze select 1', 'write'],
    ['select * from t for update', 'write'],
    ['create table t (id int)', 'ddl'],
    ['alter table t add column c int', 'ddl'],
    ['grant select on t to anon', 'ddl'],
    ['select * into new_t from t', 'ddl'],
    ['drop table t', 'destructive'],
    ['truncate t', 'destructive'],
    ['delete from t', 'destructive'],
    ['update t set a = 1', 'destructive'],
    ['alter table t drop column c', 'destructive'],
  ])('classifies %j as %s', (sql, expected) => {
    expect(kind(sql)).toBe(expected)
  })

  it('reports the most severe statement of a script and explains why', () => {
    const result = classifySql('select 1; insert into t values (1); drop table t;')
    expect(result.kind).toBe('destructive')
    expect(result.statementCount).toBe(3)
    expect(result.reasons.join(' ')).toMatch(/DROP/)
  })

  it('does not mistake keywords in identifiers or strings for statements', () => {
    expect(kind('select "drop", updated_at from t where note = \'delete me\'')).toBe('read')
  })

  it('treats unknown verbs as writes', () => {
    expect(kind('frobnicate everything')).toBe('write')
  })

  it('treats an empty script as a read', () => {
    expect(classifySql('  ;; ').kind).toBe('read')
  })
})
