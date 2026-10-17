/**
 * Minimal cron "next run" calculator, matching node-cron's semantics
 * (every field must match; day-of-month and weekday are ANDed).
 * Supports lists, ranges, steps, month/weekday names and an optional leading seconds field.
 */

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DOW_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

interface FieldSpec {
  min: number
  max: number
  names?: string[]
  nameOffset?: number
}

const FIELDS: Record<'second' | 'minute' | 'hour' | 'dom' | 'month' | 'dow', FieldSpec> = {
  second: { min: 0, max: 59 },
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dom: { min: 1, max: 31 },
  month: { min: 1, max: 12, names: MONTH_NAMES, nameOffset: 1 },
  dow: { min: 0, max: 7, names: DOW_NAMES, nameOffset: 0 },
}

function parseValue(token: string, spec: FieldSpec): number {
  const idx = spec.names?.indexOf(token.toLowerCase()) ?? -1
  if (idx >= 0) return idx + (spec.nameOffset ?? 0)
  if (!/^\d+$/.test(token)) throw new Error(`Invalid value "${token}"`)
  return parseInt(token, 10)
}

function parseField(field: string, spec: FieldSpec): Set<number> {
  const values = new Set<number>()

  for (const part of field.split(',')) {
    const [range, stepStr] = part.split('/')
    const step = stepStr === undefined ? 1 : parseInt(stepStr, 10)
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step "${stepStr}"`)

    let start: number
    let end: number
    if (range === '*') {
      start = spec.min
      end = spec.max
    } else if (range.includes('-')) {
      const [a, b] = range.split('-')
      start = parseValue(a, spec)
      end = parseValue(b, spec)
    } else {
      start = parseValue(range, spec)
      end = stepStr === undefined ? start : spec.max
    }

    if (start < spec.min || end > spec.max || start > end) {
      throw new Error(`Value out of range in "${part}"`)
    }
    for (let v = start; v <= end; v += step) values.add(v)
  }

  return values
}

export interface CronParseResult {
  valid: boolean
  error?: string
}

function parse(expression: string) {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5 && parts.length !== 6) {
    throw new Error('Expected 5 fields: minute hour day month weekday')
  }
  const hasSeconds = parts.length === 6
  const [sec, min, hour, dom, month, dow] = hasSeconds ? parts : ['0', ...parts]

  const dowSet = parseField(dow, FIELDS.dow)
  if (dowSet.has(7)) dowSet.add(0)

  return {
    second: parseField(sec, FIELDS.second),
    minute: parseField(min, FIELDS.minute),
    hour: parseField(hour, FIELDS.hour),
    dom: parseField(dom, FIELDS.dom),
    month: parseField(month, FIELDS.month),
    dow: dowSet,
  }
}

export function validateCronExpression(expression: string): CronParseResult {
  try {
    parse(expression)
    return { valid: true }
  } catch (err: any) {
    return { valid: false, error: err.message }
  }
}

/** Next date strictly after `from` that matches the expression, or null if none within ~5 years. */
export function getNextCronRun(expression: string, from: Date = new Date()): Date | null {
  let spec: ReturnType<typeof parse>
  try {
    spec = parse(expression)
  } catch {
    return null
  }

  const seconds = [...spec.second].sort((a, b) => a - b)
  const minutes = [...spec.minute].sort((a, b) => a - b)
  const hours = [...spec.hour].sort((a, b) => a - b)

  const day = new Date(from)
  day.setHours(0, 0, 0, 0)

  for (let i = 0; i < 366 * 5; i++, day.setDate(day.getDate() + 1)) {
    if (!spec.month.has(day.getMonth() + 1)) continue
    if (!spec.dom.has(day.getDate())) continue
    if (!spec.dow.has(day.getDay())) continue

    for (const h of hours) {
      for (const m of minutes) {
        for (const s of seconds) {
          const candidate = new Date(day)
          candidate.setHours(h, m, s, 0)
          if (candidate.getTime() > from.getTime()) return candidate
        }
      }
    }
  }

  return null
}
