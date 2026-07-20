import { clearQueryCacheScope } from '../queryCache'
import { getOfflineLocalStore } from '../shopping/shoppingIndexedDb'
import { clearFamilyJumpRecords } from '../features/family-jump/storage/records'
import { clearFeatureSyncRegistry } from '../sync/featureSyncRegistry'

export interface AccountCleanupStep {
  name: string
  run: () => Promise<unknown>
}

export interface AccountCleanupResult {
  completed: string[]
  failed: { step: string; reason: string }[]
  timedOut: string[]
}

/**
 * Every user-scoped layer is cleared here, in one place, with three
 * guarantees the previous `Promise.all` in signOutCurrentAccount did not give:
 *
 *   - one failing storage API cannot stop the remaining layers from being
 *     cleared (it was `all`, so the first rejection abandoned the rest),
 *   - no step can hang sign-out forever (each gets its own timeout),
 *   - the caller learns what actually got cleared.
 *
 * Sign-out proceeds even if steps fail. Leaving a user signed in because a
 * cache would not clear is strictly worse than a partial clear plus a log.
 */
const STEP_TIMEOUT_MS = 4_000

type StepOutcome = { status: 'done' } | { status: 'timeout' }

function withTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<StepOutcome> {
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null
  const timeout = new Promise<StepOutcome>((resolve) => {
    timer = globalThis.setTimeout(() => resolve({ status: 'timeout' }), timeoutMs)
  })
  return Promise.race([
    promise.then((): StepOutcome => ({ status: 'done' })),
    timeout,
  ]).finally(() => { if (timer) globalThis.clearTimeout(timer) })
}

export function buildAccountCleanupSteps(userId: string, extra: AccountCleanupStep[] = []): AccountCleanupStep[] {
  const store = getOfflineLocalStore()
  return [
    ...extra,
    { name: 'calendar', run: () => store.clearCalendarUser(userId) },
    { name: 'shopping', run: () => store.clearShoppingUser(userId) },
    { name: 'family-identity', run: () => store.saveFamilyIdentity(userId, null) },
    { name: 'query-cache', run: () => clearQueryCacheScope({ userId }) },
    { name: 'family-jump', run: async () => clearFamilyJumpRecords() },
  ]
}

export async function runAccountCleanup(steps: AccountCleanupStep[]): Promise<AccountCleanupResult> {
  const result: AccountCleanupResult = { completed: [], failed: [], timedOut: [] }
  const outcomes = await Promise.allSettled(steps.map(async (step) => {
    const outcome = await withTimeout(Promise.resolve().then(step.run), STEP_TIMEOUT_MS)
    return { step: step.name, outcome }
  }))

  for (const [index, outcome] of outcomes.entries()) {
    const name = steps[index].name
    if (outcome.status === 'rejected') {
      const reason = outcome.reason instanceof Error ? outcome.reason.message : 'unknown error'
      result.failed.push({ step: name, reason })
      continue
    }
    if (outcome.value.outcome.status === 'timeout') result.timedOut.push(name)
    else result.completed.push(name)
  }

  // In-memory registries are not storage and cannot fail; clear them last so a
  // stale pending badge cannot outlive the account it belonged to.
  clearFeatureSyncRegistry()
  return result
}
