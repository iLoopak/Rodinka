import { useEffect } from 'react'

let lockCount = 0

/**
 * Ref-counted "something now owns the whole screen" lock, shared by `Modal`,
 * the fullscreen chat portal, and the fullscreen game routes. Freezes
 * `.app-main`'s scroll via the `has-modal-open` body class (see
 * `body.has-modal-open .app-main` in index.css) for as long as at least one
 * consumer is mounted. Ref-counting matters because these surfaces can nest
 * (e.g. a modal opened from within the fullscreen chat) — a naive
 * "set on mount, clear on unmount" toggle would have the inner unmount clear
 * the lock the outer surface still needs.
 */
export function useScreenLock() {
  useEffect(() => {
    lockCount += 1
    document.body.classList.add('has-modal-open')
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) document.body.classList.remove('has-modal-open')
    }
  }, [])
}
