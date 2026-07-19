/* Rodinka service worker: runtime offline cache plus standards-based Web Push. */
const CACHE_NAME = 'rodinka-runtime-v2'
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
    event.respondWith(caches.match(request).then(async (cached) => {
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) {
        const copy = response.clone()
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, copy)
      }
      return response
    }))
  }
})

function safeDeepLink(value, fallback = '/reminders') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback
  try {
    const target = new URL(value, self.registration.scope)
    const scope = new URL(self.registration.scope)
    return target.origin === scope.origin && target.pathname.startsWith(scope.pathname) ? `${target.pathname}${target.search}${target.hash}` : fallback
  } catch { return fallback }
}

function safeId(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

async function preferredLocale() {
  const response = await caches.open(CONFIG_CACHE).then((cache) => cache.match('/__app-locale'))
  return response && await response.text() === 'en' ? 'en' : 'cs'
}

function pushPayload(event, locale) {
  const fallback = {
    version: 1, title: 'Rodinka', body: locale === 'en' ? 'You have a new reminder.' : 'Máte novou připomínku.',
    deepLink: '/reminders', tag: 'rodinka-reminder', deliveryId: null,
    conversationId: null, messageId: null, silent: false, renotify: true,
  }
  if (!event.data) return fallback
  try {
    const value = event.data.json()
    if (!value || typeof value !== 'object') return fallback
    const conversationId = safeId(value.conversationId)
    return {
      version: 1,
      title: typeof value.title === 'string' && value.title.trim() ? value.title.slice(0, 120) : fallback.title,
      body: typeof value.body === 'string' && value.body.trim() ? value.body.slice(0, 400) : fallback.body,
      // Chat payloads fall back to the conversation list, not the reminder
      // centre, when the deep link is missing or not same-origin.
      deepLink: safeDeepLink(value.deepLink, conversationId ? '/messages' : '/reminders'),
      tag: typeof value.tag === 'string' && /^rodinka-[a-z0-9:-]{1,100}$/i.test(value.tag) ? value.tag : fallback.tag,
      deliveryId: typeof value.deliveryId === 'string' ? value.deliveryId : null,
      conversationId,
      messageId: safeId(value.messageId),
      silent: value.silent === true,
      renotify: value.renotify !== false,
    }
  } catch { return fallback }
}

// Ask every live window whether it is currently showing this conversation
// in a focused tab. Windows answer over a MessageChannel; anything that does
// not answer within the timeout counts as "not looking".
//
// This is the SECOND line of defence. The server already skips a recipient
// whose presence heartbeat is fresh, so this only catches the narrow race
// where the delivery was queued just before the user opened the chat.
// Keeping it rare matters: suppressing a push spends `userVisibleOnly`
// budget, and browsers eventually show a generic "site updated in
// background" notice if a worker swallows too many.
function isConversationOpen(conversationId, timeoutMs = 700) {
  if (!conversationId) return Promise.resolve(false)
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    if (!windows.length) return false
    return Promise.race([
      Promise.all(windows.map((client) => new Promise((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = (message) => resolve(Boolean(message.data?.open))
        try {
          client.postMessage({ type: 'RODINKA_IS_CONVERSATION_OPEN', conversationId }, [channel.port2])
        } catch { resolve(false) }
      }))).then((answers) => answers.some(Boolean)),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ])
  }).catch(() => false)
}

self.addEventListener('push', (event) => {
  event.waitUntil(preferredLocale().then(async (locale) => {
    const payload = pushPayload(event, locale)
    if (await isConversationOpen(payload.conversationId)) return undefined
    return self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon.svg',
      badge: '/notification-badge.svg',
      tag: payload.tag,
      renotify: payload.renotify,
      silent: payload.silent,
      data: {
        deepLink: payload.deepLink,
        deliveryId: payload.deliveryId,
        conversationId: payload.conversationId,
        messageId: payload.messageId,
      },
    })
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const conversationId = safeId(data.conversationId)
  const messageId = safeId(data.messageId)
  const path = safeDeepLink(data.deepLink, conversationId ? '/messages' : '/reminders')
  const targetUrl = new URL(path, self.registration.scope).href
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const sameOrigin = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (sameOrigin) {
      // A live window gets a message rather than a navigation. The app
      // router is pushState-based, so `client.navigate()` to another
      // in-app path would force a full reload and throw away the loaded
      // conversation cache. For chat we hand off in-app; the app switches
      // conversation, scrolls to the message and marks it read (which is
      // what keeps the unread badge from re-counting a message the user is
      // already looking at).
      if (conversationId) {
        sameOrigin.postMessage({ type: 'RODINKA_OPEN_CONVERSATION', conversationId, messageId })
      } else if ('navigate' in sameOrigin) {
        await sameOrigin.navigate(targetUrl).catch(() => undefined)
      }
      return sameOrigin.focus()
    }
    // Cold start: the deep link carries ?c=&m= and the app reads them from
    // window.location on mount, so this also works offline against the
    // cached app shell.
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
