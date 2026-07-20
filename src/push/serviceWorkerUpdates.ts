import { useSyncExternalStore } from 'react'

/**
 * Tracks whether a newer build is installed and waiting to take over.
 *
 * The problem this exists for: Rodinka is a pushState SPA, and an installed
 * PWA tab is frequently never closed. Browsers only check for a new service
 * worker on navigation, so a home-screen app can keep running a months-old
 * build with no signal that anything newer exists. Two halves fix that —
 * asking the browser to re-check on a schedule, and telling the user once a
 * newer worker is actually waiting.
 */

const listeners = new Set<() => void>()
let updateReady = false
let waitingWorker: ServiceWorker | null = null
let registration: ServiceWorkerRegistration | null = null
let reloading = false

/** How often a long-lived tab re-checks for a new deployment. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
/** Ignore visibility-triggered checks that land closer together than this. */
const UPDATE_CHECK_THROTTLE_MS = 15 * 60 * 1000
let lastCheckedAt = 0

function publish(next: boolean) {
  if (updateReady === next) return
  updateReady = next
  listeners.forEach((listener) => listener())
}

export function subscribeToServiceWorkerUpdates(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getServiceWorkerUpdateReady() { return updateReady }

export function useServiceWorkerUpdateReady() {
  return useSyncExternalStore(subscribeToServiceWorkerUpdates, getServiceWorkerUpdateReady, getServiceWorkerUpdateReady)
}

function markWaiting(worker: ServiceWorker | null) {
  // A worker in `installed` while something already controls the page is by
  // definition an update. On a first-ever install there is no controller, and
  // announcing "new version" for the very first load would be nonsense.
  if (!worker || !navigator.serviceWorker.controller) return
  waitingWorker = worker
  publish(true)
}

function watchInstalling(current: ServiceWorkerRegistration) {
  const installing = current.installing
  if (!installing) return
  installing.addEventListener('statechange', () => {
    if (installing.state === 'installed') markWaiting(installing)
  })
}

export async function checkForServiceWorkerUpdate() {
  if (!registration) return
  const now = Date.now()
  if (now - lastCheckedAt < UPDATE_CHECK_THROTTLE_MS) return
  lastCheckedAt = now
  // update() rejects when offline or when the worker script 404s mid-deploy;
  // neither is worth surfacing, the next check will pick it up.
  await registration.update().catch(() => undefined)
}

/**
 * Applies the waiting update. The reload is safe with respect to unsent work:
 * both mutation queues live in IndexedDB and are re-read on start, so a
 * pending offline change survives.
 */
export function applyServiceWorkerUpdate() {
  if (!waitingWorker) {
    if (typeof window !== 'undefined') window.location.reload()
    return
  }
  waitingWorker.postMessage({ type: 'SKIP_WAITING' })
}

export function registerRodinkaServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Fires once the skipped worker claims the page. Guarded because a
    // controllerchange during an in-flight reload would loop.
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((current) => {
      registration = current
      lastCheckedAt = Date.now()
      // Already waiting when we registered: the update installed during a
      // previous visit and nothing ever prompted for it.
      if (current.waiting) markWaiting(current.waiting)
      watchInstalling(current)
      current.addEventListener('updatefound', () => watchInstalling(current))

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForServiceWorkerUpdate()
      })
      globalThis.setInterval(() => { void checkForServiceWorkerUpdate() }, UPDATE_CHECK_INTERVAL_MS)
    }).catch((error) => {
      console.error('Service worker registration failed:', error instanceof Error ? error.message : 'unknown error')
    })
  })
}

export function resetServiceWorkerUpdatesForTests() {
  updateReady = false
  waitingWorker = null
  registration = null
  reloading = false
  lastCheckedAt = 0
  listeners.clear()
}
