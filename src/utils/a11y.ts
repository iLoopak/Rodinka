import type { KeyboardEvent } from 'react'

// Lets a non-<button> element (e.g. a clickable <li> row) respond to
// Enter/Space like a real button. Pair with role="button" tabIndex={0}.
export function onActivateKey(onActivate: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onActivate()
    }
  }
}
