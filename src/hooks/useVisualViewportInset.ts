import { useEffect } from 'react'

const CSS_VAR = '--keyboard-inset'

let refCount = 0

function measureInset(viewport: VisualViewport): number {
  const inset = window.innerHeight - viewport.height - viewport.offsetTop
  return Math.max(0, Math.round(inset))
}

function applyInset(viewport: VisualViewport) {
  document.documentElement.style.setProperty(CSS_VAR, `${measureInset(viewport)}px`)
}

/**
 * Publishes how much of the layout viewport the on-screen keyboard currently
 * covers as `--keyboard-inset` on the root element. iOS Safari does not
 * shrink `dvh` for the keyboard (only for its own chrome), so fixed/sheet
 * surfaces that size themselves with `dvh` alone can end up with their
 * bottom edge — and any sticky footer inside it — sitting behind the
 * keyboard. Consumers subtract this var from their height (see
 * `.modal-backdrop` and `.messages-fullscreen` in index.css) instead.
 *
 * No-ops where `visualViewport` isn't supported. Safe to call from several
 * mounted consumers at once — each measurement is idempotent, so concurrent
 * listeners never disagree.
 */
export function useVisualViewportInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    refCount += 1
    const handler = () => applyInset(viewport)
    handler()
    viewport.addEventListener('resize', handler)
    viewport.addEventListener('scroll', handler)
    return () => {
      viewport.removeEventListener('resize', handler)
      viewport.removeEventListener('scroll', handler)
      refCount = Math.max(0, refCount - 1)
      if (refCount === 0) document.documentElement.style.removeProperty(CSS_VAR)
    }
  }, [])
}
