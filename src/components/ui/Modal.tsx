import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../strings'

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  backdropClassName?: string
  closeOnBackdrop?: boolean
  descriptionId?: string
}

let openModalCount = 0
let nextModalOrder = 0

export function Modal({ title, onClose, children, className, backdropClassName, closeOnBackdrop = true, descriptionId }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const modalOrderRef = useRef(0)
  const titleId = useId()
  if (modalOrderRef.current === 0) modalOrderRef.current = ++nextModalOrder
  onCloseRef.current = onClose

  useEffect(() => {
    openModalCount += 1
    document.body.classList.add('has-modal-open')
    return () => {
      openModalCount = Math.max(0, openModalCount - 1)
      if (openModalCount === 0) document.body.classList.remove('has-modal-open')
    }
  }, [])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
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
    const frame = requestAnimationFrame(() => {
      const target = sheetRef.current?.querySelector<HTMLElement>(`[autofocus], ${focusableSelector}`) ?? sheetRef.current
      target?.focus()
    })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

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
        className={`modal-sheet${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
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
