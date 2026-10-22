import { randomUUID } from 'crypto'

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface JobInfo {
  id: string
  /** Lock key: jobs sharing a key never run at the same time (e.g. a project id). */
  key: string
  kind: string
  label: string
  batchId?: string
  state: JobState
  enqueuedAt: string
  startedAt?: string
  finishedAt?: string
  error?: string
}

export interface BatchSummary {
  batchId: string
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
  finished: boolean
}

export type QueueEvent<P> =
  | { type: 'job'; job: JobInfo }
  | { type: 'progress'; job: JobInfo; progress: P }
  | { type: 'batch'; summary: BatchSummary }

export interface JobContext<P> {
  jobId: string
  signal: AbortSignal
  report: (progress: P) => void
}

export interface JobSpec<R, P> {
  key: string
  kind: string
  label: string
  batchId?: string
  run: (ctx: JobContext<P>) => Promise<R>
}

export interface JobHandle<R> {
  id: string
  promise: Promise<R>
  /** True when an identical pending job already existed and was returned instead of a new one. */
  deduped: boolean
}

export class JobCancelledError extends Error {
  constructor(message = 'Job cancelled') {
    super(message)
    this.name = 'JobCancelledError'
  }
}

interface Entry {
  info: JobInfo
  spec: JobSpec<any, any>
  controller: AbortController
  resolve: (value: any) => void
  reject: (reason: unknown) => void
  promise: Promise<any>
}

const MAX_FINISHED_KEPT = 200

/**
 * In-memory FIFO queue with a global concurrency limit and per-key mutual exclusion.
 * Every job owns its AbortController, so nothing is shared between concurrent runs.
 */
export class JobQueue<P = unknown> {
  private concurrency: number
  private readonly entries = new Map<string, Entry>()
  private readonly order: string[] = []
  private readonly onEvent?: (event: QueueEvent<P>) => void

  constructor(options: { concurrency: number; onEvent?: (event: QueueEvent<P>) => void }) {
    this.concurrency = normalizeConcurrency(options.concurrency)
    this.onEvent = options.onEvent
  }

  setConcurrency(value: number): void {
    this.concurrency = normalizeConcurrency(value)
    this.pump()
  }

  getConcurrency(): number {
    return this.concurrency
  }

  /**
   * Adds a job. With `dedupe`, an already queued/running job with the same key and kind is
   * returned instead (used by the scheduler so runs never pile up).
   */
  enqueue<R>(spec: JobSpec<R, P>, options: { dedupe?: boolean } = {}): JobHandle<R> {
    if (options.dedupe) {
      const existing = this.findPending(spec.key, spec.kind)
      if (existing) return { id: existing.info.id, promise: existing.promise, deduped: true }
    }

    const info: JobInfo = {
      id: randomUUID(),
      key: spec.key,
      kind: spec.kind,
      label: spec.label,
      batchId: spec.batchId,
      state: 'queued',
      enqueuedAt: new Date().toISOString(),
    }

    let resolve!: (value: R) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<R>((res, rej) => {
      resolve = res
      reject = rej
    })
    // Fire-and-forget callers (scheduler) must not trigger unhandled-rejection warnings.
    promise.catch(() => undefined)

    this.entries.set(info.id, { info, spec, controller: new AbortController(), resolve, reject, promise })
    this.order.push(info.id)
    this.emitJob(info)
    this.pump()
    return { id: info.id, promise, deduped: false }
  }

  /** Cancels a queued job immediately, or aborts the signal of a running one. */
  cancel(jobId: string): boolean {
    const entry = this.entries.get(jobId)
    if (!entry) return false
    if (entry.info.state === 'queued') {
      this.finish(entry, 'cancelled', new JobCancelledError())
      return true
    }
    if (entry.info.state === 'running') {
      entry.controller.abort()
      return true
    }
    return false
  }

  cancelBatch(batchId: string): number {
    let count = 0
    for (const entry of [...this.entries.values()]) {
      if (entry.info.batchId === batchId && this.cancel(entry.info.id)) count++
    }
    return count
  }

  cancelAll(): number {
    let count = 0
    for (const id of [...this.entries.keys()]) {
      if (this.cancel(id)) count++
    }
    return count
  }

  /** True while a job with this key and kind is queued or running. */
  hasPending(key: string, kind: string): boolean {
    return this.findPending(key, kind) !== undefined
  }

  list(): JobInfo[] {
    return this.order.map((id) => ({ ...this.entries.get(id)!.info }))
  }

  get(jobId: string): JobInfo | undefined {
    const entry = this.entries.get(jobId)
    return entry ? { ...entry.info } : undefined
  }

  batchSummary(batchId: string): BatchSummary | undefined {
    const jobs = this.list().filter((j) => j.batchId === batchId)
    if (jobs.length === 0) return undefined
    const count = (state: JobState) => jobs.filter((j) => j.state === state).length
    const queued = count('queued')
    const running = count('running')
    return {
      batchId,
      total: jobs.length,
      queued,
      running,
      succeeded: count('succeeded'),
      failed: count('failed'),
      cancelled: count('cancelled'),
      finished: queued + running === 0,
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private findPending(key: string, kind: string): Entry | undefined {
    for (const entry of this.entries.values()) {
      const { state } = entry.info
      if ((state === 'queued' || state === 'running') && entry.info.key === key && entry.info.kind === kind) {
        return entry
      }
    }
    return undefined
  }

  private pump(): void {
    let running = 0
    const busyKeys = new Set<string>()
    for (const entry of this.entries.values()) {
      if (entry.info.state === 'running') {
        running++
        busyKeys.add(entry.info.key)
      }
    }

    for (const id of this.order) {
      if (running >= this.concurrency) break
      const entry = this.entries.get(id)
      if (!entry || entry.info.state !== 'queued' || busyKeys.has(entry.info.key)) continue
      busyKeys.add(entry.info.key)
      running++
      this.start(entry)
    }
  }

  private start(entry: Entry): void {
    entry.info.state = 'running'
    entry.info.startedAt = new Date().toISOString()
    this.emitJob(entry.info)

    const ctx: JobContext<P> = {
      jobId: entry.info.id,
      signal: entry.controller.signal,
      report: (progress) => this.onEvent?.({ type: 'progress', job: { ...entry.info }, progress }),
    }

    Promise.resolve()
      .then(() => entry.spec.run(ctx))
      .then(
        (value) => this.finish(entry, 'succeeded', undefined, value),
        (err) => {
          if (entry.controller.signal.aborted) {
            this.finish(entry, 'cancelled', err instanceof Error ? err : new JobCancelledError())
          } else {
            this.finish(entry, 'failed', err)
          }
        }
      )
  }

  private finish(entry: Entry, state: JobState, error?: unknown, value?: unknown): void {
    entry.info.state = state
    entry.info.finishedAt = new Date().toISOString()
    if (error !== undefined) entry.info.error = error instanceof Error ? error.message : String(error)

    if (state === 'succeeded') entry.resolve(value)
    else entry.reject(error)

    this.emitJob(entry.info)
    const { batchId } = entry.info
    if (batchId && this.onEvent) {
      const summary = this.batchSummary(batchId)
      if (summary?.finished) this.onEvent({ type: 'batch', summary })
    }

    this.trimFinished()
    this.pump()
  }

  private trimFinished(): void {
    const finished = this.order.filter((id) => {
      const state = this.entries.get(id)?.info.state
      return state === 'succeeded' || state === 'failed' || state === 'cancelled'
    })
    for (const id of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_KEPT))) {
      this.entries.delete(id)
      this.order.splice(this.order.indexOf(id), 1)
    }
  }

  private emitJob(info: JobInfo): void {
    this.onEvent?.({ type: 'job', job: { ...info } })
  }
}

function normalizeConcurrency(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(16, Math.floor(value)))
}
