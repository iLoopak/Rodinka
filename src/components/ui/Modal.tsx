import { useEffect, useId, useRef, type ReactNode } from 'react'
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
  closeOnBackdrop?: boolean
  descriptionId?: string
}

export function Modal({ title, onClose, children, className, closeOnBackdrop = true, descriptionId }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  onCloseRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    function onKeyDown(e: KeyboardEvent) {
      const roots = document.querySelectorAll<HTMLElement>('[data-modal-root]')
      if (roots.item(roots.length - 1) !== backdropRef.current) return
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

  return (
    <div ref={backdropRef} className="modal-backdrop" data-modal-root onClick={closeOnBackdrop ? onClose : undefined}>
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
}
