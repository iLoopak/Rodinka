import { useSyncExternalStore } from 'react'
import { worstConnectionState, type RealtimeConnectionState } from './connectionState'

export interface RealtimeSummary {
  overall: RealtimeConnectionState
  disconnectedOwners: string[]
  activeChannelCount: number
}

interface SubscriptionStatus {
  owner: string
  state: RealtimeConnectionState
}

const subscriptions = new Map<string, SubscriptionStatus>()
const listeners = new Set<() => void>()
let snapshot: RealtimeSummary = {
  overall: 'connected',
  disconnectedOwners: [],
  activeChannelCount: 0,
}

function publish() {
  const values = [...subscriptions.values()]
  const disconnectedOwners = [...new Set(
    values
      .filter(({ state }) => state === 'reconnecting' || state === 'disconnected')
      .map(({ owner }) => owner),
  )].sort()
  const next: RealtimeSummary = {
    overall: values.length > 0 ? worstConnectionState(values.map(({ state }) => state)) : 'connected',
    disconnectedOwners,
    activeChannelCount: values.length,
  }
  if (
    next.overall === snapshot.overall
    && next.activeChannelCount === snapshot.activeChannelCount
    && next.disconnectedOwners.join('\u0000') === snapshot.disconnectedOwners.join('\u0000')
  ) return
  snapshot = next
  listeners.forEach((listener) => listener())
}

export function registerRealtimeStatus(instanceId: string, owner: string) {
  subscriptions.set(instanceId, { owner, state: 'connecting' })
  publish()
}

export function updateRealtimeStatus(instanceId: string, state: RealtimeConnectionState) {
  const current = subscriptions.get(instanceId)
  if (!current || current.state === state) return
  subscriptions.set(instanceId, { ...current, state })
  publish()
}

export function unregisterRealtimeStatus(instanceId: string) {
  if (!subscriptions.delete(instanceId)) return
  publish()
}

export function subscribeToRealtimeSummary(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRealtimeSummarySnapshot() {
  return snapshot
}

export function useRealtimeSummary() {
  return useSyncExternalStore(subscribeToRealtimeSummary, getRealtimeSummarySnapshot, getRealtimeSummarySnapshot)
}

function getRealtimeOverallSnapshot() {
  return snapshot.overall
}

export function useRealtimeOverallStatus() {
  return useSyncExternalStore(subscribeToRealtimeSummary, getRealtimeOverallSnapshot, getRealtimeOverallSnapshot)
}

export function resetRealtimeStatusStoreForTests() {
  subscriptions.clear()
  snapshot = { overall: 'connected', disconnectedOwners: [], activeChannelCount: 0 }
  listeners.forEach((listener) => listener())
}
