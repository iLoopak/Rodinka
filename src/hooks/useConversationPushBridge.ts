import { useEffect, useRef } from 'react'
import { useRouterActions } from '../router'
import {
  PRESENCE_HEARTBEAT_MS,
  clearConversationPresence,
  isPresent,
  readPresenceInput,
  touchConversationPresence,
} from '../push/conversationPresence'

// Two jobs, both about "the user is already here":
//
//  1. Heartbeat the server so queued pushes for the open conversation are
//     dropped before they are ever encrypted and sent.
//  2. Answer the service worker's synchronous "is this conversation open?"
//     probe, which covers the race where a delivery was queued moments
//     before the user opened the chat.
//
// Mounted once, above the screens, so it also answers the probe while the
// user is on a different tab of the app (answering "no" immediately is much
// better than making the worker wait out its timeout).

export function useConversationPushBridge(activeConversationId: string | null) {
  const { navigateHref } = useRouterActions()
  const activeRef = useRef<string | null>(activeConversationId)
  activeRef.current = activeConversationId

  // --- presence heartbeat -------------------------------------------------
  useEffect(() => {
    if (!activeConversationId) return
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    // Tracks whether we ever reported presence for this conversation, so we
    // only bother clearing it on the way out if we actually set it.
    let announced = false

    const beat = () => {
      if (cancelled) return
      if (!isPresent(readPresenceInput(activeConversationId))) return
      announced = true
      void touchConversationPresence(activeConversationId)
    }

    beat()
    timer = setInterval(beat, PRESENCE_HEARTBEAT_MS)

    // Losing focus should stop suppressing pushes straight away rather than
    // waiting out the server's 75s window.
    const onVisibility = () => {
      if (isPresent(readPresenceInput(activeConversationId))) beat()
      else if (announced) void clearConversationPresence(activeConversationId)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onVisibility)
    window.addEventListener('focus', onVisibility)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onVisibility)
      window.removeEventListener('focus', onVisibility)
      if (announced) void clearConversationPresence(activeConversationId)
    }
  }, [activeConversationId])

  // --- service worker handshake ------------------------------------------
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; conversationId?: string; messageId?: string | null } | null
      if (!data?.type) return

      if (data.type === 'RODINKA_IS_CONVERSATION_OPEN') {
        const open = data.conversationId === activeRef.current
          && isPresent(readPresenceInput(activeRef.current))
        event.ports?.[0]?.postMessage({ open })
        return
      }

      if (data.type === 'RODINKA_OPEN_CONVERSATION' && data.conversationId) {
        // Route through the URL rather than calling into the messages
        // context: MessagesScreen already derives the active conversation
        // from `?c=`, and `?m=` drives the scroll-to-message. This also
        // works when the click arrives while the user is on another screen.
        const target = data.messageId
          ? `/messages?c=${encodeURIComponent(data.conversationId)}&m=${encodeURIComponent(data.messageId)}`
          : `/messages?c=${encodeURIComponent(data.conversationId)}`
        navigateHref(target)
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [navigateHref])
}
