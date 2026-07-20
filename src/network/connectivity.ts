import { useSyncExternalStore } from 'react'
import { getRealtimeSummarySnapshot, subscribeToRealtimeSummary } from '../realtime/realtimeStatusStore'
import type { AppErrorCode } from '../errors/errorCodes'

export type ConnectivityState = 'online' | 'degraded' | 'offline'

export interface ConnectivitySnapshot {
  state: ConnectivityState
  browserOnline: boolean
  realtimeState: string
  /** null until something has actually tried to reach the backend. */
  backendReachable: boolean | null
  lastChangedAt: string
}

/**
 * The single answer to "can we talk to the outside world right now".
 *
 * Two rules this exists to enforce, both from the audit:
 *
 *   1. `navigator.onLine === true` is not evidence that Supabase works, so
 *      realtime health and observed backend failures also feed the state.
 *   2. A backend failure must NOT report the app as offline. Only the browser
 *      can say `offline`; everything else can at worst say `degraded`.
 *
 * Feature-level sync state deliberately stays out of this — a stuck shopping
 * queue is a shopping problem, not a connectivity one. That separation is
 * what `featureSyncRegistry` is for.
 */

const listeners = new Set<() => void>()

function readBrowserOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

let backendReachable: boolean | null = null
let snapshot: ConnectivitySnapshot = compute(readBrowserOnline(), getRealtimeSummarySnapshot().overall)

function compute(browserOnline: boolean, realtimeState: string): ConnectivitySnapshot {
  const realtimeInterrupted = realtimeState === 'reconnecting' || realtimeState === 'disconnected'
  const state: ConnectivityState = !browserOnline
    ? 'offline'
    : backendReachable === false || realtimeInterrupted
      ? 'degraded'
      : 'online'
  return {
    state,
    browserOnline,
    realtimeState,
    backendReachable,
    lastChangedAt: new Date().toISOString(),
  }
}

function publish() {
  const next = compute(readBrowserOnline(), getRealtimeSummarySnapshot().overall)
  if (
    next.state === snapshot.state
    && next.browserOnline === snapshot.browserOnline
    && next.realtimeState === snapshot.realtimeState
    && next.backendReachable === snapshot.backendReachable
  ) return
  snapshot = next
  listeners.forEach((listener) => listener())
}

/**
 * Feeds an observed backend outcome in. Callers report the *classified* code,
 * never a raw error, so that only genuine transport problems can degrade the
 * global state — a permission error says nothing about reachability.
 */
export function reportBackendOutcome(outcome: { ok: true } | { ok: false; code: AppErrorCode }) {
  if (outcome.ok) {
    if (backendReachable === true) return
    backendReachable = true
  } else {
    const affectsReachability = outcome.code === 'backend-unavailable' || outcome.code === 'request-timeout'
    if (!affectsReachability) return
    if (backendReachable === false) return
    backendReachable = false
  }
  publish()
}

export function subscribeToConnectivity(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', publish)
      window.addEventListener('offline', publish)
    }
    unsubscribeRealtime = subscribeToRealtimeSummary(publish)
    publish()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', publish)
      window.removeEventListener('offline', publish)
    }
    unsubscribeRealtime?.()
    unsubscribeRealtime = null
  }
}

let unsubscribeRealtime: (() => void) | null = null

export function getConnectivitySnapshot() { return snapshot }

export function useConnectivity(): ConnectivitySnapshot {
  return useSyncExternalStore(subscribeToConnectivity, getConnectivitySnapshot, getConnectivitySnapshot)
}

/** Convenience for the many call sites that only care about the tri-state. */
export function useConnectivityState(): ConnectivityState {
  return useConnectivity().state
}

export function resetConnectivityForTests() {
  backendReachable = null
  snapshot = compute(readBrowserOnline(), getRealtimeSummarySnapshot().overall)
  listeners.forEach((listener) => listener())
}
