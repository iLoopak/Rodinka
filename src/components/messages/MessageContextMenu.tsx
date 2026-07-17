import { useEffect, useRef, type ReactNode } from 'react'
import { t } from '../../strings'

interface Position {
  x: number
  y: number
}

interface Props {
  position: Position
  isMine: boolean
  canEdit: boolean
  canDelete: boolean
  onReply: () => void
  onReact: () => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

// Small floating menu opened by long-press on mobile or right-click
// (context menu) or menu-button on desktop. Rendered into the same
// stacking context as the message thread; positioned near the anchor
// but clamped inside the viewport so it never spills off-screen.
export function MessageContextMenu({
  position,
  isMine,
  canEdit,
  canDelete,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    const onOutside = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) onClose()
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
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    let left = position.x
    let top = position.y
    if (left + rect.width > viewportW - 12) left = Math.max(12, viewportW - rect.width - 12)
    if (top + rect.height > viewportH - 12) top = Math.max(12, viewportH - rect.height - 12)
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [position.x, position.y])

  return (
    <div
      ref={menuRef}
      role="menu"
      className="messages-context-menu"
      style={{ position: 'fixed', left: position.x, top: position.y }}
      onClick={(event) => event.stopPropagation()}
    >
      <MenuItem onClick={onReply}>
        <MenuIcon>
          <path d="M9 14 4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 9h9a6 6 0 0 1 6 6v3" strokeLinecap="round" strokeLinejoin="round" />
        </MenuIcon>
        {t.messages.reply}
      </MenuItem>
      <MenuItem onClick={onReact}>
        <MenuIcon>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14a4 4 0 0 0 7 0" strokeLinecap="round" />
          <circle cx="9" cy="10" r=".9" fill="currentColor" />
          <circle cx="15" cy="10" r=".9" fill="currentColor" />
        </MenuIcon>
        {t.messages.react}
      </MenuItem>
      {isMine && canEdit && (
        <MenuItem onClick={onEdit}>
          <MenuIcon>
            <path d="M4 20h4l10-10-4-4L4 16Z" strokeLinejoin="round" />
            <path d="m14 6 4 4" />
          </MenuIcon>
          {t.messages.edit}
        </MenuItem>
      )}
      {isMine && canDelete && (
        <MenuItem onClick={onDelete} destructive>
          <MenuIcon>
            <path d="M5 7h14" strokeLinecap="round" />
            <path d="M9 7V4h6v3" />
            <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" strokeLinejoin="round" />
          </MenuIcon>
          {t.messages.delete}
        </MenuItem>
      )}
    </div>
  )
}

function MenuItem({ onClick, destructive, children }: { onClick: () => void; destructive?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`messages-context-menu-item${destructive ? ' is-destructive' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {children}
    </svg>
  )
}
