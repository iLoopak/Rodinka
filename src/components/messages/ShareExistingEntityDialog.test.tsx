// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'

const shareEntity = vi.hoisted(() => vi.fn(async () => undefined))
const choresState = vi.hoisted(() => ({ chores: [] as unknown[], choresLoading: false, choresError: null as string | null }))
const shoppingState = vi.hoisted(() => ({ shoppingItems: [] as unknown[], shoppingLoading: false, shoppingError: null as string | null }))
const activitiesState = vi.hoisted(() => ({ activities: [] as unknown[], activitiesLoading: false, activitiesError: null as string | null }))

// Creation mutations are mocked so the test can assert they are NEVER called.
const addChore = vi.hoisted(() => vi.fn())
const addShoppingItem = vi.hoisted(() => vi.fn())
const addActivity = vi.hoisted(() => vi.fn())

vi.mock('../../context/chores/ChoresContext', () => ({
  useChoresData: () => ({ ...choresState, addChore }),
}))
vi.mock('../../context/shopping/ShoppingContext', () => ({
  useShopping: () => ({ ...shoppingState, addShoppingItem }),
}))
vi.mock('../../context/activities/ActivitiesContext', () => ({
  useActivitiesData: () => ({ ...activitiesState, addActivity }),
}))
vi.mock('../../context/family/FamilyMembersContext', () => ({
  useFamilyMembersData: () => ({ memberName: (id: string) => (id === 'm-1' ? 'Tereza' : 'Někdo') }),
}))
vi.mock('../../context/messages/MessagesContext', () => ({
  useMessagesData: () => ({ shareEntity }),
}))

import { ShareExistingEntityDialog } from './ShareExistingEntityDialog'

const chore = {
  id: 'chore-1', title: 'Vynést koš', status: 'active',
  assigned_to: 'm-1', due_date: '2026-07-14',
}
const archivedChore = { ...chore, id: 'chore-2', title: 'Starý úkol', status: 'archived' }

function reset() {
  choresState.chores = []
  choresState.choresLoading = false
  choresState.choresError = null
  shoppingState.shoppingItems = []
  shoppingState.shoppingLoading = false
  shoppingState.shoppingError = null
  activitiesState.activities = []
  activitiesState.activitiesLoading = false
  activitiesState.activitiesError = null
}

describe('ShareExistingEntityDialog', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    reset()
  })

  it('lists existing tasks and shares the selected one by reference', async () => {
    choresState.chores = [chore]
    render(<ShareExistingEntityDialog kind="task" conversationId="conv-1" onClose={vi.fn()} />)

    expect(screen.getByText('Vynést koš')).toBeTruthy()
    // Assignee and due date give the row enough context to pick correctly.
    expect(screen.getByText(/Tereza/)).toBeTruthy()

    fireEvent.click(screen.getByRole('radio'))
    fireEvent.click(screen.getByRole('button', { name: t.messages.entityPicker.submit }))

    await waitFor(() => expect(shareEntity).toHaveBeenCalledOnce())
    expect(shareEntity).toHaveBeenCalledWith('conv-1', {
      entityType: 'task',
      entityId: 'chore-1',
      fallbackLabel: 'Vynést koš',
    })
  })

  it('never creates a new record', async () => {
    choresState.chores = [chore]
    render(<ShareExistingEntityDialog kind="task" conversationId="conv-1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio'))
    fireEvent.click(screen.getByRole('button', { name: t.messages.entityPicker.submit }))

    await waitFor(() => expect(shareEntity).toHaveBeenCalledOnce())
    expect(addChore).not.toHaveBeenCalled()
    expect(addShoppingItem).not.toHaveBeenCalled()
    expect(addActivity).not.toHaveBeenCalled()
  })

  it('closes only after a successful share', async () => {
    const onClose = vi.fn()
    choresState.chores = [chore]
    render(<ShareExistingEntityDialog kind="task" conversationId="conv-1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('radio'))
    fireEvent.click(screen.getByRole('button', { name: t.messages.entityPicker.submit }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('surfaces a failed share and stays open so the pick is not lost', async () => {
    shareEntity.mockRejectedValueOnce(new Error('nope'))
    const onClose = vi.fn()
    choresState.chores = [chore]
    render(<ShareExistingEntityDialog kind="task" conversationId="conv-1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('radio'))
    fireEvent.click(screen.getByRole('button', { name: t.messages.entityPicker.submit }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(t.messages.entityPicker.shareFailed))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('hides archived tasks', () => {
    choresState.chores = [chore, archivedChore]
    render(<ShareExistingEntityDialog kind="task" conversationId="conv-1" onClose={vi.fn()} />)
    expect(screen.queryByText('Starý úkol')).toBeNull()
    expect(screen.getAllByRole('radio')).toHaveLength(1)
  })

  it('offers only unpurchased, unarchived shopping items', () => {
    shoppingState.shoppingItems = [
      { id: 's-1', name: 'Mléko', quantity: 2, unit: 'l', purchased: false, archived_at: null, responsible_member_id: null },
      { id: 's-2', name: 'Koupené', quantity: null, unit: null, purchased: true, archived_at: null, responsible_member_id: null },
      { id: 's-3', name: 'Archivované', quantity: null, unit: null, purchased: false, archived_at: '2026-07-01T00:00:00Z', responsible_member_id: null },
    ]
    render(<ShareExistingEntityDialog kind="shopping_item" conversationId="conv-1" onClose={vi.fn()} />)
    expect(screen.getByText('Mléko')).toBeTruthy()
    expect(screen.queryByText('Koupené')).toBeNull()
    expect(screen.queryByText('Archivované')).toBeNull()
  })

  it('shows event date and time so two similar events can be told apart', () => {
    activitiesState.activities = [
      { id: 'a-1', title: 'Trénink', start_date: '2026-07-14', start_time: '17:30:00', all_day: false, responsible_member_id: 'm-1' },
    ]
    render(<ShareExistingEntityDialog kind="event" conversationId="conv-1" onClose={vi.fn()} />)
    expect(screen.getByText('Trénink')).toBeTruthy()
    expect(screen.getByText(/17:30/)).toBeTruthy()
  })

  it('shows the empty state rather than a blank list', () => {
    render(<ShareExistingEntityDialog kind="event" conversationId="conv-1" onClose={vi.fn()} />)
    expect(screen.getByText(t.messages.entityPicker.event.empty)).toBeTruthy()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('shows a loading state instead of a premature empty state', () => {
    choresState.choresLoading = true
    render(<ShareExistingEntityDialog kind="task" conversationId="conv-1" onClose={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toBe(t.messages.entityPicker.loading)
    expect(screen.queryByText(t.messages.entityPicker.task.empty)).toBeNull()
  })

  it('shows an error state when the source module failed to load', () => {
    choresState.choresError = 'boom'
    render(<ShareExistingEntityDialog kind="task" conversationId="conv-1" onClose={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toBe(t.messages.entityPicker.loadFailed)
  })

  it('cannot share before something is picked', () => {
    choresState.chores = [chore]
    render(<ShareExistingEntityDialog kind="task" conversationId="conv-1" onClose={vi.fn()} />)
    const submit = screen.getByRole('button', { name: t.messages.entityPicker.submit }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('can be closed without sharing', () => {
    const onClose = vi.fn()
    choresState.chores = [chore]
    const { container } = render(<ShareExistingEntityDialog kind="task" conversationId="conv-1" onClose={onClose} />)
    // The Modal chrome also renders an "×" whose accessible name is "Close";
    // this asserts the explicit footer button.
    const footerClose = container.querySelector('.family-actions .btn-secondary') as HTMLButtonElement
    expect(footerClose.textContent).toBe(t.common.close)
    fireEvent.click(footerClose)
    expect(onClose).toHaveBeenCalled()
    expect(shareEntity).not.toHaveBeenCalled()
  })
})
