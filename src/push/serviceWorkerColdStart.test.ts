import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Offline cold start, exercised rather than asserted about.
 *
 * Every other check we have on sw.js reads its source and looks for the right
 * strings, which cannot tell you whether a request actually gets served when
 * the network is gone. This runs the worker's real fetch handler against a
 * fake Cache Storage and a fetch that rejects, which is the scenario that
 * matters: an installed PWA opened in a tunnel.
 */

const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')

class FakeCache {
  entries = new Map<string, Response>()
  async match(request: Request | string) {
    return this.entries.get(keyOf(request)) ?? undefined
  }
  async put(request: Request | string, response: Response) {
    this.entries.set(keyOf(request), response)
  }
  async addAll(urls: string[]) {
    for (const url of urls) this.entries.set(url, new Response(`cached ${url}`))
  }
}

function keyOf(request: Request | string) {
  const url = typeof request === 'string' ? request : request.url
  return url.startsWith('http') ? new URL(url).pathname : url
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>()
  async open(name: string) {
    const existing = this.caches.get(name)
    if (existing) return existing
    const created = new FakeCache()
    this.caches.set(name, created)
    return created
  }
  async keys() { return [...this.caches.keys()] }
  async delete(name: string) { return this.caches.delete(name) }
  async match(request: Request | string) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request)
      if (hit) return hit
    }
    return undefined
  }
}

interface FetchEvent {
  request: Request
  respondWith: (response: Promise<Response> | Response) => void
  waitUntil: (value: Promise<unknown>) => void
}

/** Boots sw.js in a sandbox and returns handles to what it registered. */
function bootWorker(options: { fetchImpl: typeof fetch }) {
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  const cacheStorage = new FakeCacheStorage()
  const waits: Promise<unknown>[] = []

  const self = {
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    location: { hostname: 'rodinka.app', origin: 'https://rodinka.app' },
    registration: { scope: 'https://rodinka.app/', showNotification: async () => undefined },
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async () => null },
    skipWaiting: () => undefined,
  }

  // sw.js is plain script source, so it is evaluated with the globals it
  // expects rather than imported as a module.
  const run = new Function('self', 'caches', 'fetch', 'clients', 'Response', 'Request', 'URL', 'MessageChannel', 'atob', 'setTimeout', source)
  run(
    self,
    cacheStorage,
    options.fetchImpl,
    self.clients,
    Response,
    Request,
    URL,
    class { port1 = {}; port2 = {} },
    (value: string) => Buffer.from(value, 'base64').toString('binary'),
    setTimeout,
  )

  async function dispatch(type: string, event: Record<string, unknown>) {
    for (const listener of listeners.get(type) ?? []) listener(event)
    await Promise.all(waits.splice(0))
  }

  async function fetchFor(url: string, init?: { mode?: string; destination?: string }) {
    const request = new Request(url)
    Object.defineProperty(request, 'mode', { value: init?.mode ?? 'no-cors' })
    Object.defineProperty(request, 'destination', { value: init?.destination ?? '' })
    // Held on an object rather than a bare `let`: TypeScript narrows a
    // closure-assigned local to `never` and the Response type is lost.
    const captured: { value: Promise<Response> | Response | null } = { value: null }
    const event: FetchEvent = {
      request,
      respondWith: (value) => { captured.value = value },
      waitUntil: (value) => { waits.push(value) },
    }
    await dispatch('fetch', event as unknown as Record<string, unknown>)
    return captured.value === null ? null : await captured.value
  }

  return { cacheStorage, dispatch, fetchFor, waits }
}

const networkDown = () => Promise.reject(new TypeError('Failed to fetch'))

describe('service worker offline cold start', () => {
  it('serves the cached app shell for a navigation when the network is gone', async () => {
    const worker = bootWorker({ fetchImpl: networkDown as unknown as typeof fetch })
    await worker.dispatch('install', { waitUntil: (value: Promise<unknown>) => worker.waits.push(value) })

    const response = await worker.fetchFor('https://rodinka.app/calendar', { mode: 'navigate' })

    // This is the whole point of the app-shell cache: a deep link opened
    // with no connection still boots the app instead of showing the
    // browser's offline page.
    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
    expect(await response!.text()).toContain('cached /')
  })

  it('falls back to a readable offline page when even the shell is missing', async () => {
    const worker = bootWorker({ fetchImpl: networkDown as unknown as typeof fetch })
    // No install, so nothing was ever cached.
    const response = await worker.fetchFor('https://rodinka.app/', { mode: 'navigate' })

    expect(response!.status).toBe(503)
    // Czech is the default locale, and the message has to be legible rather
    // than a stack trace.
    expect(await response!.text()).toContain('offline')
  })

  it('serves a cached asset without touching the network', async () => {
    let networkCalls = 0
    const worker = bootWorker({
      fetchImpl: (async () => { networkCalls += 1; throw new TypeError('Failed to fetch') }) as unknown as typeof fetch,
    })
    const cache = await worker.cacheStorage.open('rodinka-runtime-v2')
    await cache.put('/assets/app-abc123.js', new Response('console.log(1)'))

    const response = await worker.fetchFor('https://rodinka.app/assets/app-abc123.js', { destination: 'script' })

    expect(await response!.text()).toBe('console.log(1)')
    expect(networkCalls).toBe(0)
  })

  it('leaves an authenticated cross-origin asset out of the shared cache', async () => {
    const worker = bootWorker({ fetchImpl: networkDown as unknown as typeof fetch })

    // A signed avatar URL is a cross-origin image, which is exactly the shape
    // the runtime asset branch would otherwise cache. Only the origin check
    // keeps one family's photos out of a bucket shared with every account on
    // the device — so the request has to be one that branch would accept.
    const response = await worker.fetchFor(
      'https://project.supabase.co/storage/v1/object/sign/member-avatars/child.jpg?token=secret',
      { destination: 'image' },
    )

    expect(response).toBeNull()
    const cache = await worker.cacheStorage.open('rodinka-runtime-v2')
    expect(cache.entries.size).toBe(0)
  })

  it('does cache a same-origin asset, so the check above is about origin', async () => {
    const worker = bootWorker({
      fetchImpl: (async () => new Response('body')) as unknown as typeof fetch,
    })

    await worker.fetchFor('https://rodinka.app/assets/app-abc123.js', { destination: 'script' })

    const cache = await worker.cacheStorage.open('rodinka-runtime-v2')
    expect(cache.entries.size).toBe(1)
  })

  it('does not intercept a non-GET request', async () => {
    const worker = bootWorker({ fetchImpl: networkDown as unknown as typeof fetch })
    const request = new Request('https://rodinka.app/', { method: 'POST' })
    let responded: unknown = null
    await worker.dispatch('fetch', {
      request,
      respondWith: (value: unknown) => { responded = value },
      waitUntil: (value: Promise<unknown>) => worker.waits.push(value),
    })
    expect(responded).toBeNull()
  })
})
