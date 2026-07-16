import { createElement, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeChore } from '../utils/testFixtures'

vi.mock('./AddChoreForm', () => ({
  AddChoreForm: ({ onSubmit }: { onSubmit: (input: never) => Promise<void> }) => createElement('button', {
    type: 'button', onClick: () => void onSubmit({} as never),
  }, 'Save test chore'),
}))

vi.mock('./ui/Modal', () => ({
  Modal: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))

const { ChoreDetailModal } = await import('./ChoreDetailModal')

describe('ChoreDetailModal opened from Today', () => {
  it('closes back to Today after saving when closeAfterSave is enabled', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(createElement(ChoreDetailModal, {
      chore: makeChore({ id: 'task-1', title: 'Quick task' }),
      assignee: undefined,
      members: [],
      currentMemberId: 'member-1',
      completions: [],
      latestCompletion: null,
      canManage: true,
      initialEditing: true,
      closeAfterSave: true,
      onMarkDone: vi.fn(),
      onUpdate,
      onSetArchived: vi.fn(),
      onClose,
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Save test chore' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('task-1', {}))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
