import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  children: ReactNode
}

// Renders the conversation detail as a true top-level fullscreen overlay
// on mobile.
//
// WHY A PORTAL: the conversation detail used to be nested inside
// `.app-main`, which is an `overflow-y: auto` scroll container. On iOS
// WebKit (and, most visibly, a standalone home-screen PWA) a
// `position: fixed` element inside a scrolling ancestor is positioned and
// clipped relative to that ancestor's scroll viewport — which starts
// BELOW the sticky `.app-header` — instead of the layout viewport. The
// result was the app-shell header poking out above the "fullscreen" chat.
// Desktop Chrome/Firefox ignore the scroll ancestor for fixed elements,
// which is exactly why the bug only showed on iOS.
//
// Portaling to <body> takes the detail out of `.app-main` entirely, so its
// fixed, safe-area-aware fullscreen layout (see `.messages-fullscreen` in
// index.css) genuinely covers the viewport on every engine. This is the
// systemic fix the layout needs — not a z-index bump.
export function MobileChatPortal({ children }: Props) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  if (elementRef.current === null && typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.className = 'messages-fullscreen-portal'
    elementRef.current = el
  }

  useEffect(() => {
    const el = elementRef.current
    if (!el) return
    document.body.appendChild(el)

    // Lock the underlying app-shell scroll ONLY while the fullscreen chat
    // is open, and restore it exactly on close. We freeze `.app-main`'s
    // scroll position by pinning the body; the chat thread has its own
    // scroll container so the conversation still scrolls normally.
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.setAttribute('data-chat-fullscreen', 'true')

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.removeAttribute('data-chat-fullscreen')
      if (el.parentNode) el.parentNode.removeChild(el)
    }
  }, [])

  if (!elementRef.current) return null
  return createPortal(children, elementRef.current)
}
