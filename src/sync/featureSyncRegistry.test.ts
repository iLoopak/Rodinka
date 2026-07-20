import { afterEach, describe, expect, it } from 'vitest'
import {
  adaptRepositorySync,
  clearFeatureSyncRegistry,
  getFeatureSyncSummary,
  publishFeatureSync,
  retireFeatureSync,
} from './featureSyncRegistry'

afterEach(() => clearFeatureSyncRegistry())

describe('feature sync aggregator', () => {
  it('aggregates pending work across offline-capable features', () => {
    publishFeatureSync(adaptRepositorySync({
      feature: 'shopping', status: 'syncing', pendingCount: 2, lastSyncedAt: '2026-07-20T09:00:00.000Z', errorCode: null,
    }))
    publishFeatureSync(adaptRepositorySync({
      feature: 'calendar', status: 'offline', pendingCount: 1, lastSyncedAt: '2026-07-20T08:00:00.000Z', errorCode: null,
    }))

    const summary = getFeatureSyncSummary()
    expect(summary.totalPendingCount).toBe(3)
    expect(summary.hasPendingChanges).toBe(true)
    expect(summary.isSyncing).toBe(true)
    // The oldest of the two: everything on screen is current only as of then.
    expect(summary.lastSyncedAt).toBe('2026-07-20T08:00:00.000Z')
  })

  it('separates a retryable failure from one that needs the user', () => {
    publishFeatureSync(adaptRepositorySync({
      feature: 'shopping', status: 'error', pendingCount: 1, lastSyncedAt: null, errorCode: 'backend-unavailable',
    }))
    expect(getFeatureSyncSummary().hasRetryableError).toBe(true)
    expect(getFeatureSyncSummary().hasBlockingError).toBe(false)

    publishFeatureSync(adaptRepositorySync({
      feature: 'calendar', status: 'error', pendingCount: 1, lastSyncedAt: null, errorCode: 'permission-denied',
    }))
    expect(getFeatureSyncSummary().hasBlockingError).toBe(true)
  })

  it('treats offline with an empty queue as idle rather than pending', () => {
    const snapshot = adaptRepositorySync({
      feature: 'shopping', status: 'offline', pendingCount: 0, lastSyncedAt: null, errorCode: null,
    })
    expect(snapshot.state).toBe('idle')
    publishFeatureSync(snapshot)
    expect(getFeatureSyncSummary().hasPendingChanges).toBe(false)
  })

  it('drops a feature when its provider unmounts', () => {
    publishFeatureSync(adaptRepositorySync({
      feature: 'shopping', status: 'syncing', pendingCount: 4, lastSyncedAt: null, errorCode: null,
    }))
    retireFeatureSync('shopping')
    expect(getFeatureSyncSummary().totalPendingCount).toBe(0)
    expect(getFeatureSyncSummary().features).toEqual([])
  })

  it('is emptied by account cleanup so a badge cannot outlive its account', () => {
    publishFeatureSync(adaptRepositorySync({
      feature: 'shopping', status: 'syncing', pendingCount: 7, lastSyncedAt: null, errorCode: null,
    }))
    clearFeatureSyncRegistry()
    expect(getFeatureSyncSummary().totalPendingCount).toBe(0)
  })
})
