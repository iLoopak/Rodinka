import { useEffect, useRef } from 'react'

export interface ScrollableTab<T extends string> { id: T; label: string; count?: number }

interface Props<T extends string> {
  tabs: readonly ScrollableTab<T>[]
  activeTab: T
  onChange: (tab: T) => void
  ariaLabel?: string
}

export function ScrollableTabs<T extends string>({ tabs, activeTab, onChange, ariaLabel }: Props<T>) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement>())

  useEffect(() => {
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    tabRefs.current.get(activeTab)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeTab])

  function selectByIndex(index: number) {
    const next = tabs[index]
    if (!next) return
    onChange(next.id)
    tabRefs.current.get(next.id)?.focus()
  }

  return (
    <div className="scrollable-tabs-shell">
      <div className="tabs scrollable-tabs" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => { if (node) tabRefs.current.set(tab.id, node); else tabRefs.current.delete(tab.id) }}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`tab-button${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null
              if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
              if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
              if (event.key === 'Home') nextIndex = 0
              if (event.key === 'End') nextIndex = tabs.length - 1
              if (nextIndex === null) return
              event.preventDefault()
              selectByIndex(nextIndex)
            }}
          >
            {tab.label}
            {!!tab.count && <span className="tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
