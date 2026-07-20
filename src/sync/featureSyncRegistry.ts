import { useSyncExternalStore } from 'react'
import { isRetryableErrorCode, type AppErrorCode } from '../errors/errorCodes'

export type FeatureSyncState = 'idle' | 'syncing' | 'pending' | 'error'

export interface FeatureSyncSnapshot {
  feature: string
  state: FeatureSyncState
  pendingCount: number
  lastSyncedAt: string | null
  lastErrorCode: AppErrorCode | null
  retryable: boolean
}

export interface FeatureSyncSummary {
  features: FeatureSyncSnapshot[]
  hasPendingChanges: boolean
  totalPendingCount: number
  isSyncing: boolean
  hasRetryableError: boolean
  hasBlockingError: boolean
  lastSyncedAt: string | null
}

/**
 * A read-only aggregate over the features that genuinely have local state to
 * reconcile. Each repository keeps its own queue and its own snapshot shape;
 * this only adapts what they already publish into one vocabulary so global UI
 * can ask "is anything pending?" without importing three feature contexts.
 *
 * Online-only modules (messages, reminders) are deliberately absent. Adding
 * them would mean inventing a mutation queue they do not have and do not need.
 */

const features = new Map<string, FeatureSyncSnapshot>()
const listeners = new Set<() => void>()

const EMPTY_SUMMARY: FeatureSyncSummary = {
  features: [],
  hasPendingChanges: false,
  totalPendingCount: 0,
  isSyncing: false,
  hasRetryableError: false,
  hasBlockingError: false,
  lastSyncedAt: null,
}

let summary: FeatureSyncSummary = EMPTY_SUMMARY

function buildSummary(): FeatureSyncSummary {
  const values = [...features.values()].sort((a, b) => a.feature.localeCompare(b.feature))
  if (values.length === 0) return EMPTY_SUMMARY
  const errored = values.filter((entry) => entry.state === 'error')
  const syncedTimes = values.map((entry) => entry.lastSyncedAt).filter((value): value is string => Boolean(value))
  return {
    features: values,
    hasPendingChanges: values.some((entry) => entry.pendingCount > 0),
    totalPendingCount: values.reduce((total, entry) => total + entry.pendingCount, 0),
    isSyncing: values.some((entry) => entry.state === 'syncing'),
    hasRetryableError: errored.some((entry) => entry.retryable),
    hasBlockingError: errored.some((entry) => !entry.retryable),
    // The oldest successful sync across features: the point from which
    // everything on screen is known to be current.
    lastSyncedAt: syncedTimes.length === values.length && syncedTimes.length > 0
      ? syncedTimes.reduce((oldest, value) => value < oldest ? value : oldest)
      : null,
  }
}

function sameSnapshot(a: FeatureSyncSnapshot | undefined, b: FeatureSyncSnapshot) {
  return Boolean(a)
    && a!.state === b.state
    && a!.pendingCount === b.pendingCount
    && a!.lastSyncedAt === b.lastSyncedAt
    && a!.lastErrorCode === b.lastErrorCode
    && a!.retryable === b.retryable
}

function publish() {
  summary = buildSummary()
  listeners.forEach((listener) => listener())
}

export function publishFeatureSync(snapshot: FeatureSyncSnapshot) {
  if (sameSnapshot(features.get(snapshot.feature), snapshot)) return
  features.set(snapshot.feature, snapshot)
  publish()
}

export function retireFeatureSync(feature: string) {
  if (!features.delete(feature)) return
  publish()
}

export function subscribeToFeatureSync(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getFeatureSyncSummary() { return summary }

export function useFeatureSyncSummary(): FeatureSyncSummary {
  return useSyncExternalStore(subscribeToFeatureSync, getFeatureSyncSummary, getFeatureSyncSummary)
}

/**
 * Adapter for the `'offline' | 'syncing' | 'synced' | 'error'` shape both the
 * shopping and calendar repositories already publish.
 */
export function adaptRepositorySync(input: {
  feature: string
  status: 'offline' | 'syncing' | 'synced' | 'error'
  pendingCount: number
  lastSyncedAt: string | null
  errorCode: AppErrorCode | null
}): FeatureSyncSnapshot {
  const state: FeatureSyncState = input.status === 'error'
    ? 'error'
    : input.status === 'syncing'
      ? 'syncing'
      // Offline with nothing queued is idle, not pending — there is simply
      // nothing to reconcile, and showing a sync badge would be noise.
      : input.pendingCount > 0
        ? 'pending'
        : 'idle'
  return {
    feature: input.feature,
    state,
    pendingCount: input.pendingCount,
    lastSyncedAt: input.lastSyncedAt,
    lastErrorCode: input.errorCode,
    retryable: input.errorCode === null ? true : isRetryableErrorCode(input.errorCode),
  }
}

/** Used by account cleanup so a pending badge cannot outlive its account. */
export function clearFeatureSyncRegistry() {
  features.clear()
  summary = EMPTY_SUMMARY
  listeners.forEach((listener) => listener())
}

export const resetFeatureSyncForTests = clearFeatureSyncRegistry
