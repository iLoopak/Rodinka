// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const worker = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')

class FakeWorker extends EventTarget {
  state: ServiceWorker['state'] = 'installing'
  posted: unknown[] = []
  postMessage(message: unknown) { this.posted.push(message) }
  setState(next: ServiceWorker['state']) {
    this.state = next
    this.dispatchEvent(new Event('statechange'))
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null
  waiting: FakeWorker | null = null
  updateCalls = 0
  async update() { this.updateCalls += 1 }
}

function installContainer(options: { controlled: boolean }) {
  const container = new EventTarget() as EventTarget & {
    controller: unknown
    register: ReturnType<typeof vi.fn>
  }
  container.controller = options.controlled ? {} : null
  const registration = new FakeRegistration()
  container.register = vi.fn(async () => registration)
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
  return { container, registration }
}

let reloads: number
// registerRodinkaServiceWorker attaches to the shared document/window, and
// jsdom keeps those between cases. Without tearing them down, listeners from
// earlier tests fire on later ones and the counts stop meaning anything.
let attached: { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject }[]

function trackListeners(target: EventTarget) {
  const original = target.addEventListener.bind(target)
  vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
    if (listener) attached.push({ target, type, listener })
    original(type, listener, options)
  })
}

beforeEach(() => {
  vi.resetModules()
  reloads = 0
  attached = []
  trackListeners(document)
  trackListeners(window)
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload: () => { reloads += 1 } },
    configurable: true,
  })
})

afterEach(() => {
  for (const { target, type, listener } of attached) target.removeEventListener(type, listener)
  vi.restoreAllMocks()
})

/** Runs registration, which is deferred to the window `load` event. */
async function register(module: typeof import('./serviceWorkerUpdates')) {
  module.registerRodinkaServiceWorker()
  window.dispatchEvent(new Event('load'))
  await vi.waitFor(() => expect(navigator.serviceWorker.register).toHaveBeenCalled())
}

describe('service worker update flow', () => {
  it('announces an update once a new worker finishes installing', async () => {
    const { registration } = installContainer({ controlled: true })
    const module = await import('./serviceWorkerUpdates')
    await register(module)

    expect(module.getServiceWorkerUpdateReady()).toBe(false)

    const installing = new FakeWorker()
    registration.installing = installing
    registration.dispatchEvent(new Event('updatefound'))
    installing.setState('installed')

    expect(module.getServiceWorkerUpdateReady()).toBe(true)
  })

  it('stays quiet on a first install, when nothing controls the page yet', async () => {
    const { registration } = installContainer({ controlled: false })
    const module = await import('./serviceWorkerUpdates')
    await register(module)

    const installing = new FakeWorker()
    registration.installing = installing
    registration.dispatchEvent(new Event('updatefound'))
    installing.setState('installed')

    // The very first worker is not "a new version"; announcing it would show
    // a reload prompt on someone's first ever visit.
    expect(module.getServiceWorkerUpdateReady()).toBe(false)
  })

  it('picks up an update that installed during an earlier visit', async () => {
    const { registration } = installContainer({ controlled: true })
    registration.waiting = new FakeWorker()
    const module = await import('./serviceWorkerUpdates')
    await register(module)

    // Nothing prompted last time, so the worker is already parked in waiting.
    expect(module.getServiceWorkerUpdateReady()).toBe(true)
  })

  it('asks the waiting worker to take over instead of reloading blindly', async () => {
    const { registration } = installContainer({ controlled: true })
    const waiting = new FakeWorker()
    registration.waiting = waiting
    const module = await import('./serviceWorkerUpdates')
    await register(module)

    module.applyServiceWorkerUpdate()

    expect(waiting.posted).toEqual([{ type: 'SKIP_WAITING' }])
    // The reload comes from controllerchange, not from here: reloading first
    // would just re-open the same old worker.
    expect(reloads).toBe(0)
  })

  it('reloads once the new worker claims the page, and only once', async () => {
    const { container, registration } = installContainer({ controlled: true })
    registration.waiting = new FakeWorker()
    const module = await import('./serviceWorkerUpdates')
    await register(module)

    module.applyServiceWorkerUpdate()
    container.dispatchEvent(new Event('controllerchange'))
    container.dispatchEvent(new Event('controllerchange'))

    expect(reloads).toBe(1)
  })

  it('re-checks for a deployment when a long-lived tab becomes visible', async () => {
    const { registration } = installContainer({ controlled: true })
    const module = await import('./serviceWorkerUpdates')
    await register(module)

    // A pushState SPA never navigates, so without this an installed PWA can
    // run an old build indefinitely — the browser has no reason to look.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 30 * 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(registration.updateCalls).toBe(1))
  })

  it('throttles repeated visibility checks', async () => {
    const { registration } = installContainer({ controlled: true })
    const module = await import('./serviceWorkerUpdates')
    await register(module)

    const base = Date.now() + 30 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(base)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(registration.updateCalls).toBe(1))

    // Tabbing back and forth must not turn into a request per switch.
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.updateCalls).toBe(1)
  })

  it('survives an update check that rejects', async () => {
    const { registration } = installContainer({ controlled: true })
    registration.update = async () => { throw new Error('Failed to fetch') }
    const module = await import('./serviceWorkerUpdates')
    await register(module)

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 30 * 60 * 1000)
    // Offline, or the worker script 404s mid-deploy. Neither is worth
    // surfacing and neither may throw past the listener.
    await expect(module.checkForServiceWorkerUpdate()).resolves.toBeUndefined()
  })
})

describe('service worker update contract', () => {
  it('only skips waiting when the page asks it to', () => {
    // Swapping the worker without asking would reload a tab mid-edit. The one
    // and only call site has to be the message handler.
    const calls = worker.match(/skipWaiting\(\)/g) ?? []
    expect(calls).toHaveLength(1)
    expect(worker).toContain("if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()")
  })

  it('claims open clients on activate', () => {
    // Otherwise the activated worker only controls pages loaded after it, and
    // an installed PWA whose tab never closes keeps the old one.
    expect(worker).toContain('self.clients.claim()')
  })
})
