import { useRef, type ReactNode } from 'react'
import { t } from '../../strings'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeCount: number
  onClear: () => void
  children?: ReactNode
  id: string
  label?: string
  showLabel?: string
  hideLabel?: string
}

export function FilterDisclosure({ open, onOpenChange, activeCount, onClear, children, id, label = t.calendar.filtersLabel, showLabel = t.calendar.showFilters, hideLabel = t.calendar.hideFilters }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hasFilters = activeCount > 0
  return (
    <div className="filter-disclosure">
      <div className="filter-disclosure-bar">
        <button ref={buttonRef} type="button" className={`btn-secondary filter-disclosure-toggle${hasFilters ? ' active' : ''}`}
          aria-expanded={open} aria-controls={id} onClick={() => onOpenChange(!open)}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          {open ? hideLabel : showLabel}
          {hasFilters && <span className="filter-active-count">{activeCount}</span>}
        </button>
        {hasFilters && <span className="filter-active-summary">
          <span role="status">{t.calendar.activeFilters(activeCount)}</span>
          <button type="button" className="link" onClick={onClear}>{t.calendar.clearFilters}</button>
        </span>}
      </div>
      <div id={id} className="filter-disclosure-panel" role="region" aria-label={label} hidden={!open}
        onKeyDown={(event) => { if (event.key === 'Escape') { onOpenChange(false); buttonRef.current?.focus() } }}>
        {children}
      </div>
    </div>
  )
}
