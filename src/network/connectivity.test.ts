// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getConnectivitySnapshot,
  reportBackendOutcome,
  resetConnectivityForTests,
  subscribeToConnectivity,
} from './connectivity'
import { registerRealtimeStatus, resetRealtimeStatusStoreForTests, updateRealtimeStatus } from '../realtime/realtimeStatusStore'

let unsubscribe: () => void

function setBrowserOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

beforeEach(() => {
  resetRealtimeStatusStoreForTests()
  setBrowserOnline(true)
  resetConnectivityForTests()
  unsubscribe = subscribeToConnectivity(() => {})
})

afterEach(() => {
  unsubscribe()
  resetRealtimeStatusStoreForTests()
  resetConnectivityForTests()
})

describe('connectivity snapshot', () => {
  it('is online when the browser and realtime are both healthy', () => {
    expect(getConnectivitySnapshot().state).toBe('online')
  })

  it('is offline only when the browser says so', () => {
    setBrowserOnline(false)
    const snapshot = getConnectivitySnapshot()
    expect(snapshot.state).toBe('offline')
    expect(snapshot.browserOnline).toBe(false)
  })

  it('reports a reachable-but-broken backend as degraded, not offline', () => {
    reportBackendOutcome({ ok: false, code: 'backend-unavailable' })
    const snapshot = getConnectivitySnapshot()
    // The acceptance criterion: a backend failure on a live network must not
    // masquerade as the device being offline.
    expect(snapshot.state).toBe('degraded')
    expect(snapshot.browserOnline).toBe(true)
    expect(snapshot.backendReachable).toBe(false)
  })

  it('treats a request timeout as degraded', () => {
    reportBackendOutcome({ ok: false, code: 'request-timeout' })
    expect(getConnectivitySnapshot().state).toBe('degraded')
  })

  it('does not degrade on a permission or auth error', () => {
    // A 403 says nothing about reachability, and must never be allowed to
    // push the app onto an offline path that unlocks cached family data.
    reportBackendOutcome({ ok: false, code: 'permission-denied' })
    expect(getConnectivitySnapshot().state).toBe('online')
    reportBackendOutcome({ ok: false, code: 'auth-expired' })
    expect(getConnectivitySnapshot().state).toBe('online')
  })

  it('degrades while realtime is reconnecting', () => {
    registerRealtimeStatus('channel-1', 'ShoppingProvider')
    updateRealtimeStatus('channel-1', 'reconnecting')
    expect(getConnectivitySnapshot().state).toBe('degraded')

    updateRealtimeStatus('channel-1', 'connected')
    expect(getConnectivitySnapshot().state).toBe('online')
  })

  it('recovers to online once the backend answers again', () => {
    reportBackendOutcome({ ok: false, code: 'backend-unavailable' })
    expect(getConnectivitySnapshot().state).toBe('degraded')
    reportBackendOutcome({ ok: true })
    expect(getConnectivitySnapshot().state).toBe('online')
  })

  it('keeps reporting offline while the browser is down even if the backend looks fine', () => {
    reportBackendOutcome({ ok: true })
    setBrowserOnline(false)
    expect(getConnectivitySnapshot().state).toBe('offline')
  })
})
