import { describe, expect, it } from 'vitest'
import type { ShoppingItem, ShoppingItemInput } from '../utils/shopping'
import { MemoryShoppingStore } from './shoppingIndexedDb'
import { applyShoppingMutation, type ShoppingMutation } from './shoppingMutationQueue'
import { ShoppingRepository } from './shoppingRepository'
import type { ShoppingRemote } from './shoppingSync'

const input: ShoppingItemInput = { name: 'Milk', quantity: 1, unit: 'l', note: '', category: 'dairy', responsibleMemberId: null }

/** A Postgrest-shaped rejection: a plain object, not an Error subclass. */
function postgrestError(code: string, message: string) {
  return { code, message, details: '', hint: '' }
}

class ScriptedRemote implements ShoppingRemote {
  items: ShoppingItem[] = []
  applied: ShoppingMutation[] = []
  /** itemId -> error to throw, consumed on each attempt unless `sticky`. */
  failures = new Map<string, { error: unknown; sticky: boolean }>()

  async applyMutation(mutation: ShoppingMutation) {
    const failure = this.failures.get(mutation.itemId)
    if (failure) {
      if (!failure.sticky) this.failures.delete(mutation.itemId)
      throw failure.error
    }
    this.applied.push(structuredClone(mutation))
    this.items = applyShoppingMutation(this.items, mutation)
  }

  async fetchItems() { return structuredClone(this.items) }
}

function repository(store: MemoryShoppingStore, remote: ScriptedRemote, isOnline: () => boolean) {
  let id = 0
  return new ShoppingRepository({
    familyId: 'family-1', userId: 'user-1', currentMemberId: 'member-1', store, remote, isOnline,
    realtime: async () => async () => undefined,
    createId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    now: () => new Date('2026-07-20T10:00:00Z'),
  })
}

describe('shopping mutation lifecycle', () => {
  it('parks a permanently rejected mutation instead of retrying it forever', async () => {
    const remote = new ScriptedRemote()
    const repo = repository(new MemoryShoppingStore(), remote, () => true)
    await repo.start()

    const added = await repo.addItem(input)
    remote.failures.set(added.item.id, { error: postgrestError('P0001', 'Shopping item name is required'), sticky: true })
    await repo.sync()

    const snapshot = repo.getSnapshot()
    expect(snapshot.failedMutations).toHaveLength(1)
    expect(snapshot.failedMutations[0].error).toBe('mutation-failed')
    expect(snapshot.failedMutations[0].retryable).toBe(false)
    expect(snapshot.status).toBe('error')
    // A hard failure is not "pending work"; it is waiting on the user.
    expect(snapshot.pendingCount).toBe(0)
    await repo.stop()
  })

  it('does not let one rejected mutation block the rest of the queue', async () => {
    const remote = new ScriptedRemote()
    const repo = repository(new MemoryShoppingStore(), remote, () => true)
    await repo.start()

    const bad = await repo.addItem(input)
    const good = await repo.addItem({ ...input, name: 'Bread', category: 'bakery', unit: null })
    remote.failures.set(bad.item.id, { error: postgrestError('P0001', 'rejected'), sticky: true })
    await repo.sync()

    // The old all-or-nothing batch put every mutation back on any failure, so
    // a permanently invalid one held the whole list hostage.
    expect(remote.applied.map((mutation) => mutation.itemId)).toEqual([good.item.id])
    expect(repo.getSnapshot().failedMutations.map((mutation) => mutation.itemId)).toEqual([bad.item.id])
    await repo.stop()
  })

  it('stops the run on a transport failure and leaves the queue retryable', async () => {
    const remote = new ScriptedRemote()
    const repo = repository(new MemoryShoppingStore(), remote, () => true)
    await repo.start()

    const first = await repo.addItem(input)
    await repo.addItem({ ...input, name: 'Bread', category: 'bakery', unit: null })
    remote.failures.set(first.item.id, { error: new TypeError('Failed to fetch'), sticky: false })
    await repo.sync()

    const snapshot = repo.getSnapshot()
    // Nothing is parked; the network will come back and both still go out.
    expect(snapshot.failedMutations).toEqual([])
    expect(snapshot.pendingCount).toBe(2)
    expect(snapshot.status).toBe('error')
    expect(snapshot.error).toBe('backend-unavailable')
    await repo.stop()
  })

  it('grows the attempt count across automatic retries', async () => {
    const remote = new ScriptedRemote()
    const store = new MemoryShoppingStore()
    const repo = repository(store, remote, () => true)
    await repo.start()

    const added = await repo.addItem(input)
    remote.failures.set(added.item.id, { error: new TypeError('Failed to fetch'), sticky: true })
    await repo.sync()
    await repo.sync()

    // Without a per-mutation attempt count every retry waited the same delay
    // and hammered a backend that had already failed.
    const [queued] = await store.loadMutations({ userId: 'user-1', familyId: 'family-1' })
    expect(queued.attempts).toBe(2)
    expect(queued.status).toBe('pending')
    expect(queued.retryable).toBe(true)
    await repo.stop()
  })

  it('resets the attempt count when the user retries by hand', async () => {
    const remote = new ScriptedRemote()
    const store = new MemoryShoppingStore()
    const repo = repository(store, remote, () => true)
    await repo.start()

    const added = await repo.addItem(input)
    remote.failures.set(added.item.id, { error: new TypeError('Failed to fetch'), sticky: true })
    await repo.sync()
    await repo.sync()

    await repo.retryFailed(added.item.id)

    // An explicit retry is a fresh start: someone watching the screen should
    // not be made to wait out a backoff the automatic retries accumulated.
    const [queued] = await store.loadMutations({ userId: 'user-1', familyId: 'family-1' })
    expect(queued.attempts).toBe(1)
    await repo.stop()
  })

  it('keeps a server-owned item on screen when a rejected edit is discarded', async () => {
    const remote = new ScriptedRemote()
    const repo = repository(new MemoryShoppingStore(), remote, () => true)
    await repo.start()

    const added = await repo.addItem(input)
    await repo.sync()
    expect(remote.items).toHaveLength(1)

    // Now the item exists on the server. A rejected *edit* to it is a
    // different case from a rejected create: discarding the edit must not
    // delete a row the server still owns.
    remote.failures.set(added.item.id, { error: postgrestError('P0001', 'rejected'), sticky: true })
    await repo.updateItem(added.item.id, { ...input, name: 'Oat milk' })
    await repo.sync()
    expect(repo.getSnapshot().failedMutations).toHaveLength(1)

    remote.failures.clear()
    await repo.discardFailed(added.item.id)
    await repo.sync()

    expect(repo.getSnapshot().items.map((item) => item.name)).toEqual(['Milk'])
    expect(repo.getSnapshot().failedMutations).toEqual([])
    await repo.stop()
  })

  it('retries a parked mutation when the user asks', async () => {
    const remote = new ScriptedRemote()
    const repo = repository(new MemoryShoppingStore(), remote, () => true)
    await repo.start()

    const added = await repo.addItem(input)
    remote.failures.set(added.item.id, { error: postgrestError('P0001', 'rejected'), sticky: false })
    await repo.sync()
    expect(repo.getSnapshot().failedMutations).toHaveLength(1)

    await repo.retryFailed(added.item.id)

    expect(repo.getSnapshot().failedMutations).toEqual([])
    expect(repo.getSnapshot().status).toBe('synced')
    expect(remote.items.map((item) => item.name)).toEqual(['Milk'])
    await repo.stop()
  })

  it('discards a parked mutation and rolls its optimistic item off the list', async () => {
    const remote = new ScriptedRemote()
    const repo = repository(new MemoryShoppingStore(), remote, () => true)
    await repo.start()

    const added = await repo.addItem(input)
    remote.failures.set(added.item.id, { error: postgrestError('P0001', 'rejected'), sticky: true })
    await repo.sync()
    expect(repo.getSnapshot().items).toHaveLength(1)

    await repo.discardFailed(added.item.id)

    // The screen must stop showing a change that will never land.
    expect(repo.getSnapshot().items).toEqual([])
    expect(repo.getSnapshot().failedMutations).toEqual([])
    expect(repo.getSnapshot().status).toBe('synced')
    await repo.stop()
  })

  it('clears the failure when the user corrects the rejected item', async () => {
    const remote = new ScriptedRemote()
    const repo = repository(new MemoryShoppingStore(), remote, () => true)
    await repo.start()

    const added = await repo.addItem(input)
    remote.failures.set(added.item.id, { error: postgrestError('P0001', 'rejected'), sticky: false })
    await repo.sync()
    expect(repo.getSnapshot().failedMutations).toHaveLength(1)

    // Editing folds into the queued create and resets its state, so the user
    // never has to press retry separately after fixing the problem.
    await repo.updateItem(added.item.id, { ...input, name: 'Oat milk' })
    await repo.sync()

    expect(repo.getSnapshot().failedMutations).toEqual([])
    expect(remote.items.map((item) => item.name)).toEqual(['Oat milk'])
    await repo.stop()
  })

  it('resumes a mutation that was interrupted mid-flight by a reload', async () => {
    const store = new MemoryShoppingStore()
    const remote = new ScriptedRemote()
    const first = repository(store, remote, () => false)
    await first.start()
    const added = await first.addItem(input)
    await first.stop()

    // Simulate the process dying while the mutation was on the wire.
    const scope = { userId: 'user-1', familyId: 'family-1' }
    const queued = await store.loadMutations(scope)
    await store.replaceMutations(scope, queued.map((mutation) => ({ ...mutation, status: 'syncing' as const })))

    const restarted = repository(store, remote, () => true)
    await restarted.start()
    await restarted.sync()

    // A stuck `syncing` row would otherwise never be picked up again; the
    // server ledger makes resending it safe.
    expect(remote.applied.map((mutation) => mutation.itemId)).toEqual([added.item.id])
    expect(restarted.getSnapshot().pendingCount).toBe(0)
    await restarted.stop()
  })

  it('reports a permission failure as non-retryable rather than as an outage', async () => {
    const remote = new ScriptedRemote()
    const repo = repository(new MemoryShoppingStore(), remote, () => true)
    await repo.start()

    const added = await repo.addItem(input)
    remote.failures.set(added.item.id, { error: postgrestError('42501', 'permission denied for table shopping_items'), sticky: true })
    await repo.sync()

    // Losing family membership must park the mutation, not spin retries
    // against a server that will keep refusing.
    const [failure] = repo.getSnapshot().failedMutations
    expect(failure.error).toBe('permission-denied')
    expect(failure.retryable).toBe(false)
    await repo.stop()
  })
})
