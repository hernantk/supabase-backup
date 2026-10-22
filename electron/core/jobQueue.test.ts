import { describe, it, expect } from 'vitest'
import { JobQueue, JobCancelledError, type QueueEvent } from './jobQueue'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('JobQueue', () => {
  it('respects the global concurrency limit and runs queued jobs as slots free up', async () => {
    const queue = new JobQueue({ concurrency: 2 })
    const gates = [deferred(), deferred(), deferred()]
    const started: number[] = []

    const handles = gates.map((gate, i) =>
      queue.enqueue({
        key: `project-${i}`,
        kind: 'backup',
        label: `p${i}`,
        run: async () => {
          started.push(i)
          await gate.promise
          return i
        },
      })
    )

    await tick()
    expect(started).toEqual([0, 1])
    expect(queue.get(handles[2].id)?.state).toBe('queued')

    gates[0].resolve()
    await expect(handles[0].promise).resolves.toBe(0)
    await tick()
    expect(started).toEqual([0, 1, 2])

    gates[1].resolve()
    gates[2].resolve()
    await Promise.all(handles.map((h) => h.promise))
  })

  it('never runs two jobs with the same key at once', async () => {
    const queue = new JobQueue({ concurrency: 4 })
    const first = deferred()
    let secondStarted = false

    queue.enqueue({ key: 'p', kind: 'backup', label: 'a', run: () => first.promise })
    const second = queue.enqueue({
      key: 'p',
      kind: 'restore',
      label: 'b',
      run: async () => {
        secondStarted = true
      },
    })

    await tick()
    expect(secondStarted).toBe(false)

    first.resolve()
    await second.promise
    expect(secondStarted).toBe(true)
  })

  it('does not let a blocked same-key job starve jobs for other keys', async () => {
    const queue = new JobQueue({ concurrency: 2 })
    const first = deferred()
    const ran: string[] = []

    queue.enqueue({ key: 'a', kind: 'backup', label: 'a1', run: () => first.promise })
    queue.enqueue({ key: 'a', kind: 'restore', label: 'a2', run: async () => { ran.push('a2') } })
    const other = queue.enqueue({ key: 'b', kind: 'backup', label: 'b1', run: async () => { ran.push('b1') } })

    await other.promise
    expect(ran).toEqual(['b1'])
    first.resolve()
  })

  it('dedupes pending jobs with the same key and kind when asked to', async () => {
    const queue = new JobQueue({ concurrency: 1 })
    const gate = deferred()
    const a = queue.enqueue({ key: 'p', kind: 'backup', label: 'a', run: () => gate.promise })
    const b = queue.enqueue({ key: 'p', kind: 'backup', label: 'b', run: async () => undefined }, { dedupe: true })

    expect(b.deduped).toBe(true)
    expect(b.id).toBe(a.id)
    expect(queue.list()).toHaveLength(1)
    gate.resolve()
    await a.promise
  })

  it('isolates failures: one failing job does not affect the others', async () => {
    const queue = new JobQueue({ concurrency: 2 })
    const bad = queue.enqueue({ key: 'a', kind: 'backup', label: 'a', run: async () => { throw new Error('boom') } })
    const good = queue.enqueue({ key: 'b', kind: 'backup', label: 'b', run: async () => 'ok' })

    await expect(bad.promise).rejects.toThrow('boom')
    await expect(good.promise).resolves.toBe('ok')
    expect(queue.get(bad.id)).toMatchObject({ state: 'failed', error: 'boom' })
    expect(queue.get(good.id)?.state).toBe('succeeded')
  })

  it('cancels a queued job without ever running it', async () => {
    const queue = new JobQueue({ concurrency: 1 })
    const gate = deferred()
    let ran = false
    queue.enqueue({ key: 'a', kind: 'backup', label: 'a', run: () => gate.promise })
    const queued = queue.enqueue({ key: 'b', kind: 'backup', label: 'b', run: async () => { ran = true } })

    expect(queue.cancel(queued.id)).toBe(true)
    await expect(queued.promise).rejects.toBeInstanceOf(JobCancelledError)
    expect(queue.get(queued.id)?.state).toBe('cancelled')

    gate.resolve()
    await tick()
    expect(ran).toBe(false)
  })

  it('aborts the signal of a running job and marks it cancelled', async () => {
    const queue = new JobQueue({ concurrency: 1 })
    const handle = queue.enqueue({
      key: 'a',
      kind: 'backup',
      label: 'a',
      run: ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('stopped')))
        }),
    })

    await tick()
    expect(queue.cancel(handle.id)).toBe(true)
    await expect(handle.promise).rejects.toThrow('stopped')
    expect(queue.get(handle.id)?.state).toBe('cancelled')
  })

  it('reports batch progress and emits one batch event when everything has finished', async () => {
    const events: QueueEvent<unknown>[] = []
    const queue = new JobQueue({ concurrency: 2, onEvent: (e) => events.push(e) })

    const handles = [
      queue.enqueue({ key: 'a', kind: 'backup', label: 'a', batchId: 'batch-1', run: async () => 'ok' }),
      queue.enqueue({ key: 'b', kind: 'backup', label: 'b', batchId: 'batch-1', run: async () => { throw new Error('x') } }),
      queue.enqueue({ key: 'c', kind: 'backup', label: 'c', batchId: 'batch-1', run: async () => 'ok' }),
    ]
    await Promise.allSettled(handles.map((h) => h.promise))

    const batchEvents = events.filter((e) => e.type === 'batch')
    expect(batchEvents).toHaveLength(1)
    expect(queue.batchSummary('batch-1')).toMatchObject({
      total: 3,
      succeeded: 2,
      failed: 1,
      cancelled: 0,
      finished: true,
    })
  })

  it('forwards progress reports tagged with the job', async () => {
    const events: QueueEvent<number>[] = []
    const queue = new JobQueue<number>({ concurrency: 1, onEvent: (e) => events.push(e) })
    const handle = queue.enqueue({
      key: 'a',
      kind: 'backup',
      label: 'a',
      run: async ({ report }) => {
        report(10)
        report(90)
      },
    })
    await handle.promise

    const progress = events.filter((e) => e.type === 'progress')
    expect(progress.map((e) => (e.type === 'progress' ? e.progress : null))).toEqual([10, 90])
    expect(progress.every((e) => e.job.id === handle.id)).toBe(true)
  })

  it('picks up a concurrency increase immediately', async () => {
    const queue = new JobQueue({ concurrency: 1 })
    const gates = [deferred(), deferred()]
    const started: number[] = []
    gates.forEach((gate, i) =>
      queue.enqueue({ key: `k${i}`, kind: 'backup', label: `${i}`, run: async () => { started.push(i); await gate.promise } })
    )

    await tick()
    expect(started).toEqual([0])
    queue.setConcurrency(2)
    await tick()
    expect(started).toEqual([0, 1])
    gates.forEach((g) => g.resolve())
  })
})
