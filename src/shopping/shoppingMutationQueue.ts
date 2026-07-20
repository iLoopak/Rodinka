import type { AppErrorCode } from '../errors/errorCodes'
import type { ShoppingCategory, ShoppingItem } from '../utils/shopping'

export type ShoppingMutationType = 'create' | 'update' | 'delete' | 'toggle' | 'reorder'
export type ShoppingMutationStatus = 'pending' | 'syncing' | 'failed'

export interface ShoppingMutation {
  mutationId: string
  familyId: string
  type: ShoppingMutationType
  itemId: string
  payload: Record<string, unknown>
  createdAt: string
  /** How many sync attempts this mutation has survived; drives backoff. */
  attempts: number
  status: ShoppingMutationStatus
  /**
   * False once the server has rejected this for a reason retrying cannot fix
   * — a validation error, a conflict, or lost access. Such a mutation stops
   * consuming retries and waits for the user to correct or discard it, rather
   * than pinning the whole queue in a permanent error state.
   */
  retryable: boolean
  error: AppErrorCode | null
}

/** A freshly created mutation, before it has met the server. */
export function newShoppingMutationState() {
  return { attempts: 0, status: 'pending' as const, retryable: true, error: null }
}

/**
 * Mutations still worth sending. A non-retryable failure is skipped until the
 * user retries or discards it explicitly.
 */
export function syncableShoppingMutations(mutations: ShoppingMutation[]) {
  return mutations.filter((mutation) => mutation.status !== 'failed' || mutation.retryable)
}

export function failedShoppingMutations(mutations: ShoppingMutation[]) {
  return mutations.filter((mutation) => mutation.status === 'failed' && !mutation.retryable)
}

export function pendingShoppingMutationCount(mutations: ShoppingMutation[]) {
  return syncableShoppingMutations(mutations).length
}

/**
 * A mutation interrupted mid-flight (tab closed, process killed) is stored as
 * `syncing` and would otherwise never be picked up again. The server ledger
 * makes resending it safe, so it goes back to `pending` on load.
 */
export function resumeInterruptedShoppingMutations(mutations: ShoppingMutation[]): ShoppingMutation[] {
  return mutations.map((mutation) => mutation.status === 'syncing'
    ? { ...mutation, status: 'pending' as const, retryable: true }
    : mutation)
}

export function pendingShoppingItemIds(mutations: ShoppingMutation[]): Set<string> {
  return new Set(mutations.flatMap((mutation) => mutation.type === 'reorder'
    ? [mutation.itemId, ...asStringArray(mutation.payload.orderedTargetIds)]
    : [mutation.itemId]))
}

export function enqueueShoppingMutation(
  current: ShoppingMutation[],
  next: ShoppingMutation,
): ShoppingMutation[] {
  const existingCreate = current.find((mutation) => mutation.itemId === next.itemId && mutation.type === 'create')

  if (existingCreate) {
    if (next.type === 'delete') return current.filter((mutation) => mutation.itemId !== next.itemId)
    const item = existingCreate.payload.item as ShoppingItem
    const updatedItem = applyMutationToItem(item, next)
    // Folding an edit into a create is the "correct it" half of the
    // discard/retry/correct flow: the user changed the thing the server
    // rejected, so the failure no longer describes what we are about to send.
    return current.map((mutation) => mutation.mutationId === existingCreate.mutationId
      ? { ...mutation, payload: { item: updatedItem }, createdAt: next.createdAt, ...newShoppingMutationState() }
      : mutation)
  }

  if (next.type === 'delete') {
    return [
      ...current.filter((mutation) => mutation.itemId !== next.itemId),
      next,
    ]
  }

  if (next.type === 'update' || next.type === 'toggle') {
    const withoutOlderSameType = current.filter((mutation) => !(mutation.itemId === next.itemId && mutation.type === next.type))
    return [...withoutOlderSameType, next]
  }

  if (next.type === 'reorder') {
    const withoutOlderReorder = current.filter((mutation) => !(mutation.itemId === next.itemId && mutation.type === 'reorder'))
    return [...withoutOlderReorder, next]
  }

  return [...current, next]
}

export function applyPendingShoppingMutations(
  serverItems: ShoppingItem[],
  mutations: ShoppingMutation[],
): ShoppingItem[] {
  let items = [...serverItems]
  for (const mutation of mutations) items = applyShoppingMutation(items, mutation)
  return items
}

export function applyShoppingMutation(items: ShoppingItem[], mutation: ShoppingMutation): ShoppingItem[] {
  if (mutation.type === 'create') {
    const created = mutation.payload.item as ShoppingItem
    return [...items.filter((item) => item.id !== created.id), created]
  }
  if (mutation.type === 'delete') return items.filter((item) => item.id !== mutation.itemId)
  if (mutation.type === 'reorder') {
    const category = mutation.payload.targetCategory as ShoppingCategory
    const positions = new Map(asStringArray(mutation.payload.orderedTargetIds).map((id, index) => [id, (index + 1) * 1024]))
    return items.map((item) => item.id === mutation.itemId
      ? { ...item, category, sort_order: positions.get(item.id) ?? item.sort_order, updated_at: mutation.createdAt }
      : positions.has(item.id)
        ? { ...item, sort_order: positions.get(item.id)!, updated_at: mutation.createdAt }
        : item)
  }
  return items.map((item) => item.id === mutation.itemId ? applyMutationToItem(item, mutation) : item)
}

function applyMutationToItem(item: ShoppingItem, mutation: ShoppingMutation): ShoppingItem {
  if (mutation.type === 'update') return { ...item, ...mutation.payload, updated_at: mutation.createdAt } as ShoppingItem
  if (mutation.type === 'toggle') {
    const purchased = Boolean(mutation.payload.purchased)
    return {
      ...item,
      purchased,
      purchased_at: purchased ? String(mutation.payload.purchasedAt ?? mutation.createdAt) : null,
      purchased_by_member_id: purchased ? String(mutation.payload.purchasedByMemberId ?? '') || null : null,
      archived_at: purchased ? item.archived_at : null,
      updated_at: mutation.createdAt,
    }
  }
  if (mutation.type === 'reorder') {
    const orderedIds = asStringArray(mutation.payload.orderedTargetIds)
    return {
      ...item,
      category: mutation.payload.targetCategory as ShoppingCategory,
      sort_order: Math.max(1, orderedIds.indexOf(item.id) + 1) * 1024,
      updated_at: mutation.createdAt,
    }
  }
  return item
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
