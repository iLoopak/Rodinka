import { useEffect, useRef } from 'react'

/**
 * Ordered stack of "things the hardware back button (or Escape) should
 * close first" — modals, sheets, and fullscreen overlays that aren't a
 * route change. Most-recently-registered entry is topmost, mirroring
 * `Modal`'s own `data-modal-order` stacking so the two mechanisms agree on
 * what's on top.
 */
let nextOrder = 0
const stack: { order: number; dismiss: () => void }[] = []

export function registerDismissable(dismiss: () => void): () => void {
  const entry = { order: ++nextOrder, dismiss }
  stack.push(entry)
  return () => {
    const index = stack.indexOf(entry)
    if (index !== -1) stack.splice(index, 1)
  }
}

/** True if something is currently registered to intercept back/Escape. */
export function hasDismissable(): boolean {
  return stack.length > 0
}

/**
 * Closes the topmost registered overlay. Returns whether anything closed.
 * Pops the entry immediately rather than waiting for the caller's `dismiss`
 * to trigger unmount/cleanup — those are typically deferred to the next
 * render, and a second back-press before then must reach the *next* overlay
 * down, not re-dismiss the same one.
 */
export function dismissTopmost(): boolean {
  const topmost = stack.pop()
  if (!topmost) return false
  topmost.dismiss()
  return true
}

/** Registers `onDismiss` as a back/Escape target for as long as `active` is true. */
export function useBackDismiss(active: boolean, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!active) return
    return registerDismissable(() => onDismissRef.current())
  }, [active])
}

export function resetBackDismissForTests() {
  stack.length = 0
  nextOrder = 0
}
