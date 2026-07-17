import { useEffect, useRef } from 'react'
import { t } from '../../strings'

// The common six — deliberately small so no runtime library or CDN is
// pulled in. The parent can extend this list later without touching
// the UI shell.
export const COMMON_REACTIONS = ['❤️', '😂', '👍', '👎', '🎉', '😢'] as const

interface Props {
  position: { x: number; y: number }
  onPick: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ position, onPick, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onOutside = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onOutside)
    window.addEventListener('touchstart', onOutside, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onOutside)
      window.removeEventListener('touchstart', onOutside)
    }
  }, [onClose])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = position.x
    let top = position.y
    if (left + rect.width > vw - 12) left = Math.max(12, vw - rect.width - 12)
    if (top + rect.height > vh - 12) top = Math.max(12, vh - rect.height - 12)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [position.x, position.y])

  return (
    <div
      ref={rootRef}
      className="messages-emoji-picker"
      role="menu"
      aria-label={t.messages.commonReactions}
      style={{ position: 'fixed', left: position.x, top: position.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {COMMON_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitem"
          className="messages-emoji-picker-item"
          onClick={() => {
            onPick(emoji)
            onClose()
          }}
        >
          <span aria-hidden="true">{emoji}</span>
          <span className="sr-only">{emoji}</span>
        </button>
      ))}
    </div>
  )
}
