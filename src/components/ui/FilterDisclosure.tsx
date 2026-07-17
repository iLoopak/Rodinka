import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react'
import { t } from '../../strings'

interface FilterDisclosureValue {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeCount: number
  onClear: () => void
  id: string
  label: string
  showLabel: string
  hideLabel: string
  buttonRef: RefObject<HTMLButtonElement | null>
}

const FilterDisclosureContext = createContext<FilterDisclosureValue | null>(null)

function useFilterDisclosure(component: string): FilterDisclosureValue {
  const value = useContext(FilterDisclosureContext)
  if (!value) throw new Error(`<${component}> must be rendered inside <FilterDisclosure>`)
  return value
}

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

/* The toggle lives in the screen header while the panel stays with the content
   it filters, so the two halves share state through this context instead of
   each screen threading the same props to both places. */
export function FilterDisclosure({ open, onOpenChange, activeCount, onClear, children, id, label = t.calendar.filtersLabel, showLabel = t.calendar.showFilters, hideLabel = t.calendar.hideFilters }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  return (
    <FilterDisclosureContext.Provider value={{ open, onOpenChange, activeCount, onClear, id, label, showLabel, hideLabel, buttonRef }}>
      {children}
    </FilterDisclosureContext.Provider>
  )
}

export function FilterDisclosureToggle() {
  const { open, onOpenChange, activeCount, id, showLabel, hideLabel, buttonRef } = useFilterDisclosure('FilterDisclosureToggle')
  const hasFilters = activeCount > 0
  const name = open ? hideLabel : showLabel
  return (
    <button ref={buttonRef} type="button" className={`header-action-button btn-secondary filter-disclosure-toggle${hasFilters ? ' active' : ''}`}
      aria-expanded={open} aria-controls={id} aria-label={name} title={name} onClick={() => onOpenChange(!open)}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
      <span className="filter-disclosure-toggle-label">{name}</span>
      {hasFilters && <span className="filter-active-count">{activeCount}</span>}
    </button>
  )
}

export function FilterDisclosurePanel({ children }: { children?: ReactNode }) {
  const { open, onOpenChange, activeCount, onClear, id, label, buttonRef } = useFilterDisclosure('FilterDisclosurePanel')
  return (
    <div className="filter-disclosure">
      {activeCount > 0 && <div className="filter-active-summary">
        <span role="status">{t.calendar.activeFilters(activeCount)}</span>
        <button type="button" className="link" onClick={onClear}>{t.calendar.clearFilters}</button>
      </div>}
      <div id={id} className="filter-disclosure-panel" role="region" aria-label={label} hidden={!open}
        onKeyDown={(event) => { if (event.key === 'Escape') { onOpenChange(false); buttonRef.current?.focus() } }}>
        {children}
      </div>
    </div>
  )
}
