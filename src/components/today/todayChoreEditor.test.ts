import { describe, expect, it, vi } from 'vitest'
import { closeTodayChoreEditor, openTodayChoreEditor } from './todayChoreEditor'

describe('Today chore editor routing', () => {
  it('opens editing on Today by adding query state without changing the route', () => {
    const setQueryParam = vi.fn()
    openTodayChoreEditor('task-1', setQueryParam)
    expect(setQueryParam.mock.calls).toEqual([
      ['chore', 'task-1'],
      ['edit', '1', 'replace'],
    ])
  })

  it('closes editing by replacing only the Today query state', () => {
    const removeQueryParam = vi.fn()
    closeTodayChoreEditor(removeQueryParam)
    expect(removeQueryParam.mock.calls).toEqual([
      ['edit', 'replace'],
      ['chore', 'replace'],
    ])
  })
})
