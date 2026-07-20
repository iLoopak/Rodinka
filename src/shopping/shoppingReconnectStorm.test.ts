// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ShoppingItem, ShoppingItemInput } from '../utils/shopping'
import { MemoryShoppingStore } from './shoppingIndexedDb'
import { applyShoppingMutation, type ShoppingMutation } from './shoppingMutationQueue'
import { ShoppingRepository } from './shoppingRepository'
import type { ShoppingRemote } from './shoppingSync'

const input: ShoppingItemInput = { name: 'Milk', quantity: 1, unit: 'l', note: '', category: 'dairy', responsibleMemberId: null }

/**
 * "Reconnect must not create duplicate server records" is an acceptance
 * criterion that has so far rested on an argument rather than a test: the
 * apply_shopping_mutation RPC dedupes through a ledger keyed by mutationId.
 * That argument only holds while the client (a) does not run two syncs over
 * the same queue at once and (b) never regenerates the key on retry. Both are
 * pinned here, because a change to either would reintroduce duplicates
 * silently — the server would have no way to tell the difference.
 */
class GatedRemote implements ShoppingRemote {
  items: ShoppingItem[] = []
  /** Every mutationId handed to the server, including failed attempts. */
  attempted: string[] = []
  applied: ShoppingMutation[] = []
  failures = new Map<string, unknown>()
  private release: (() => void) | null = null
  private gate: Promise<void> | null = null

  hold() { this.gate = new Promise<void>((resolve) => { this.release = resolve }) }
  letThrough() {
    this.release?.()
    this.gate = null
    this.release = null
  }

  async applyMutation(mutation: ShoppingMutation) {
    this.attempted.push(mutation.mutationId)
    const failure = this.failures.get(mutation.mutationId)
    if (failure) {
      this.failures.delete(mutation.mutationId)
      throw failure
    }
    if (this.gate) await this.gate
    this.applied.push(structuredClone(mutation))
    this.items = applyShoppingMutation(this.items, mutation)
  }

  async fetchItems() { return structuredClone(this.items) }
}

const SCOPE = { userId: 'user-1', familyId: 'family-1' }

function repository(remote: GatedRemote) {
  let id = 0
  const state = { online: false }
  const store = new MemoryShoppingStore()
  const repo = new ShoppingRepository({
    familyId: 'family-1', userId: 'user-1', currentMemberId: 'member-1',
    store, remote, isOnline: () => state.online,
    realtime: async () => async () => undefined,
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    now: () => new Date('2026-07-20T10:00:00Z'),
  })
  return { repo, store, goOnline: () => { state.online = true } }
}

/** Lets queued microtask syncs and their continuations settle. */
async function settle() {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve()
}

describe('shopping reconnect storm', () => {
  it('applies each mutation once when the online event fires repeatedly', async () => {
    const remote = new GatedRemote()
    const { repo, goOnline } = repository(remote)
    await repo.start()

    await repo.addItem(input)
    await repo.addItem({ ...input, name: 'Bread', category: 'bakery', unit: null })
    goOnline()

    // Hold the first mutation on the wire, then flap the connection while it
    // is still in flight — a phone moving between cells does exactly this.
    remote.hold()
    const first = repo.sync()
    await settle()
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    await settle()
    remote.letThrough()
    await first
    await repo.sync()

    expect(remote.applied).toHaveLength(2)
    expect(new Set(remote.attempted).size).toBe(remote.attempted.length)
    await repo.stop()
  })

  it('resends a failed mutation under its original idempotency key', async () => {
    const remote = new GatedRemote()
    const { repo, store, goOnline } = repository(remote)
    await repo.start()

    await repo.addItem(input)
    const [queued] = await store.loadMutations(SCOPE)
    remote.failures.set(queued.mutationId, new TypeError('Failed to fetch'))
    goOnline()

    await repo.sync()
    await repo.sync()

    // Two attempts, one key. A regenerated key on retry would look like a
    // brand new mutation to the ledger and insert the item twice.
    expect(remote.attempted).toHaveLength(2)
    expect(remote.attempted[0]).toBe(remote.attempted[1])
    expect(remote.applied).toHaveLength(1)
    await repo.stop()
  })

  it('keeps the key stable across a reload as well as a retry', async () => {
    const store = new MemoryShoppingStore()
    const remote = new GatedRemote()
    let id = 0
    const state = { online: false }
    const options = {
      familyId: 'family-1', userId: 'user-1', currentMemberId: 'member-1',
      store, remote, isOnline: () => state.online,
      realtime: async () => async () => undefined,
      createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
      now: () => new Date('2026-07-20T10:00:00Z'),
    }

    const first = new ShoppingRepository(options)
    await first.start()
    await first.addItem(input)
    const [persisted] = await store.loadMutations(SCOPE)
    await first.stop()

    // The queue is reloaded from IndexedDB by a fresh repository, the way a
    // restarted app would. The key has to come back with it.
    const restarted = new ShoppingRepository(options)
    await restarted.start()
    state.online = true
    await restarted.sync()

    expect(remote.attempted).toEqual([persisted.mutationId])
    await restarted.stop()
  })

  it('does not double-apply when a manual retry lands during an automatic sync', async () => {
    const remote = new GatedRemote()
    const { repo, goOnline } = repository(remote)
    await repo.start()

    await repo.addItem(input)
    goOnline()

    // Someone presses "try again" while the periodic sync is already running.
    remote.hold()
    const automatic = repo.sync()
    await settle()
    const manual = repo.retryFailed()
    await settle()
    remote.letThrough()
    await Promise.all([automatic, manual])
    await settle()

    expect(remote.applied).toHaveLength(1)
    expect(new Set(remote.attempted).size).toBe(remote.attempted.length)
    expect(repo.getSnapshot().pendingCount).toBe(0)
    await repo.stop()
  })
})
