import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../strings'
import { useBackDismiss } from '../../platform/backDismiss'
import { useScreenLock } from '../../hooks/useScreenLock'
import { useVisualViewportInset } from '../../hooks/useVisualViewportInset'

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * How the sheet presents. On desktop all three centre; the difference is on
 * mobile, where `sheet` rises from the bottom and `fullscreen` takes the whole
 * viewport for a long editor. `centered` is the default small dialog.
 */
export type ModalSize = 'centered' | 'sheet' | 'fullscreen'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  size?: ModalSize
  className?: string
  backdropClassName?: string
  closeOnBackdrop?: boolean
  descriptionId?: string
  /** Optional identity mark shown beside the title (e.g. an activity's category icon). Decorative only — title stays the sole accessible name. */
  icon?: ReactNode
}

let nextModalOrder = 0

export function Modal({ title, onClose, children, size = 'centered', className, backdropClassName, closeOnBackdrop = true, descriptionId, icon }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const modalOrderRef = useRef(0)
  const titleId = useId()
  if (modalOrderRef.current === 0) modalOrderRef.current = ++nextModalOrder
  onCloseRef.current = onClose

  // Lets the Android hardware back button close the topmost modal, the same
  // way Escape already does below.
  useBackDismiss(true, onClose)

  useScreenLock()
  useVisualViewportInset()

  // Escape/Tab-trap: recomputes the topmost modal and its focusable elements
  // live on every keypress, so this stays mount-only without going stale.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const roots = document.querySelectorAll<HTMLElement>('[data-modal-root]')
      const topmost = [...roots].reduce<HTMLElement | null>((current, candidate) => {
        if (!current) return candidate
        return Number(candidate.dataset.modalOrder) > Number(current.dataset.modalOrder) ? candidate : current
      }, null)
      if (topmost !== backdropRef.current) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = [...(sheetRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        e.preventDefault()
        sheetRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Capture what had focus before the modal opened, and restore it only once
  // the modal is gone for good — deliberately mount-only (not keyed on
  // `title`) so an in-modal content swap (e.g. form -> success screen)
  // doesn't lose track of the original trigger element.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  // Moves focus into the sheet's first focusable element. Keyed on `title`
  // (not just mount) so a same-modal content swap that changes the title —
  // e.g. a wizard moving from its form to a success screen — re-focuses the
  // new content instead of leaving focus on a control that just disappeared.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // Queried separately and given priority: an element in a combined
      // selector list doesn't get to "jump the queue" just because it
      // matches `[autofocus]` — querySelector still returns whichever
      // qualifying element comes first in document order (here, always the
      // close button, since it precedes `children`).
      const target = sheetRef.current?.querySelector<HTMLElement>('[autofocus]')
        ?? sheetRef.current?.querySelector<HTMLElement>(focusableSelector)
        ?? sheetRef.current
      target?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [title])

  const content = (
    <div
      ref={backdropRef}
      className={`modal-backdrop${backdropClassName ? ` ${backdropClassName}` : ''}`}
      data-modal-root
      data-modal-order={modalOrderRef.current}
      style={{ zIndex: 100 + modalOrderRef.current }}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={sheetRef}
        className={`modal-sheet modal-sheet-${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-title">
            {icon && <span className="modal-header-icon" aria-hidden="true">{icon}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t.common.close}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )

  // Static rendering has no document to portal into. In the browser every
  // modal is portalled so app-shell stacking contexts cannot trap it.
  if (typeof document === 'undefined') return content
  return createPortal(content, document.body)
}
