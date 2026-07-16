// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScrollableTabs } from './ScrollableTabs'

const tabs = [
  { id: 'first', label: 'First' },
  { id: 'second', label: 'Second' },
  { id: 'third', label: 'Third' },
] as const

describe('ScrollableTabs', () => {
  beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn() })

  it('selects and focuses tabs with arrow, Home and End keys', () => {
    const onChange = vi.fn()
    const view = render(createElement(ScrollableTabs, { tabs, activeTab: 'second', onChange }))
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Second' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('third')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Third' }))
    view.rerender(createElement(ScrollableTabs, { tabs, activeTab: 'third', onChange }))
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Third' }), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('first')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Third' }), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('third')
  })

  it('scrolls the selected tab into view', () => {
    const view = render(createElement(ScrollableTabs, { tabs, activeTab: 'first', onChange: () => undefined }))
    view.rerender(createElement(ScrollableTabs, { tabs, activeTab: 'second', onChange: () => undefined }))
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
