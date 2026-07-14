/* Rodinka service worker: runtime offline cache plus standards-based Web Push. */
const CACHE_NAME = 'rodinka-runtime-v1'
const CONFIG_CACHE = 'rodinka-push-config-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/notification-badge.svg']

self.addEventListener('install', (event) => {
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') return
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith('rodinka-runtime-') && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put('/', copy))
      return response
    }).catch(async () => (await caches.match('/')) || new Response((await preferredLocale()) === 'cs' ? 'Rodinka je momentálně offline.' : 'Rodinka is currently offline.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })))
    return
  }
  if (url.pathname.startsWith('/assets/') || ['style', 'script', 'image', 'font'].includes(request.destination)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      return response
    })))
  }
})

function safeDeepLink(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/reminders'
  try {
    const target = new URL(value, self.registration.scope)
    const scope = new URL(self.registration.scope)
    return target.origin === scope.origin && target.pathname.startsWith(scope.pathname) ? `${target.pathname}${target.search}${target.hash}` : '/reminders'
  } catch { return '/reminders' }
}

async function preferredLocale() {
  const response = await caches.open(CONFIG_CACHE).then((cache) => cache.match('/__app-locale'))
  return response && await response.text() === 'en' ? 'en' : 'cs'
}

function pushPayload(event, locale) {
  const fallback = { version: 1, title: 'Rodinka', body: locale === 'en' ? 'You have a new reminder.' : 'Máte novou připomínku.', deepLink: '/reminders', tag: 'rodinka-reminder' }
  if (!event.data) return fallback
  try {
    const value = event.data.json()
    if (!value || typeof value !== 'object') return fallback
    return {
      version: 1,
      title: typeof value.title === 'string' && value.title.trim() ? value.title.slice(0, 120) : fallback.title,
      body: typeof value.body === 'string' && value.body.trim() ? value.body.slice(0, 400) : fallback.body,
      deepLink: safeDeepLink(value.deepLink),
      tag: typeof value.tag === 'string' && /^rodinka-[a-z0-9:-]{1,100}$/i.test(value.tag) ? value.tag : fallback.tag,
      deliveryId: typeof value.deliveryId === 'string' ? value.deliveryId : null,
    }
  } catch { return fallback }
}

self.addEventListener('push', (event) => {
  event.waitUntil(preferredLocale().then((locale) => {
    const payload = pushPayload(event, locale)
    return self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon.svg',
      badge: '/notification-badge.svg',
      tag: payload.tag,
      renotify: true,
      data: { deepLink: payload.deepLink, deliveryId: payload.deliveryId },
    })
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = safeDeepLink(event.notification.data?.deepLink)
  const targetUrl = new URL(path, self.registration.scope).href
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const sameOrigin = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (sameOrigin) {
      if ('navigate' in sameOrigin) await sameOrigin.navigate(targetUrl)
      return sameOrigin.focus()
    }
    return clients.openWindow(targetUrl)
  }))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PUSH_CONFIG' && typeof event.data.vapidPublicKey === 'string') {
    event.waitUntil(caches.open(CONFIG_CACHE).then((cache) => cache.put('/__push-config', new Response(event.data.vapidPublicKey))))
  }
  if (event.data?.type === 'APP_LOCALE' && (event.data.locale === 'cs' || event.data.locale === 'en')) {
    event.waitUntil(caches.open(CONFIG_CACHE).then((cache) => cache.put('/__app-locale', new Response(event.data.locale))))
  }
})

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(caches.open(CONFIG_CACHE).then((cache) => cache.match('/__push-config')).then(async (response) => {
    if (!response) return
    const key = await response.text()
    const subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(key) })
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', endpoint: subscription.endpoint })
  }).catch(() => undefined))
})
