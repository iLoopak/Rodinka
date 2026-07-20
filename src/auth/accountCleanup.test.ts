// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAccountCleanup, type AccountCleanupStep } from './accountCleanup'

beforeEach(() => vi.useRealTimers())

function step(name: string, run: () => Promise<unknown>): AccountCleanupStep {
  return { name, run }
}

describe('account cleanup workflow', () => {
  it('clears every layer when all of them cooperate', async () => {
    const calls: string[] = []
    const result = await runAccountCleanup([
      step('calendar', async () => { calls.push('calendar') }),
      step('shopping', async () => { calls.push('shopping') }),
      step('query-cache', async () => { calls.push('query-cache') }),
    ])

    expect(calls.sort()).toEqual(['calendar', 'query-cache', 'shopping'])
    expect(result.failed).toEqual([])
    expect(result.timedOut).toEqual([])
  })

  it('keeps clearing the other layers when one storage API fails', async () => {
    const cleared: string[] = []
    const result = await runAccountCleanup([
      step('calendar', async () => { throw new Error('IndexedDB unavailable') }),
      step('shopping', async () => { cleared.push('shopping') }),
      step('query-cache', async () => { cleared.push('query-cache') }),
    ])

    // The old Promise.all abandoned the remaining layers on the first
    // rejection, which is how a signed-out account's data survived (P0-5).
    expect(cleared.sort()).toEqual(['query-cache', 'shopping'])
    expect(result.failed.map(({ step: name }) => name)).toEqual(['calendar'])
    expect(result.completed.sort()).toEqual(['query-cache', 'shopping'])
  })

  it('does not let a hung storage API block sign-out forever', async () => {
    vi.useFakeTimers()
    const cleared: string[] = []
    const pending = runAccountCleanup([
      step('calendar', () => new Promise(() => {})),
      step('shopping', async () => { cleared.push('shopping') }),
    ])

    await vi.advanceTimersByTimeAsync(5_000)
    const result = await pending

    expect(result.timedOut).toEqual(['calendar'])
    expect(cleared).toEqual(['shopping'])
    vi.useRealTimers()
  })

  it('reports a synchronous throw as a failed step rather than escaping', async () => {
    const result = await runAccountCleanup([
      step('calendar', () => { throw new Error('boom') }),
      step('shopping', async () => undefined),
    ])
    expect(result.failed.map(({ step: name }) => name)).toEqual(['calendar'])
    expect(result.completed).toEqual(['shopping'])
  })
})
