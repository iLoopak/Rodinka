// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDestructiveActionDialog, DestructiveIconButton, RecurringDeleteScopeDialog, UndoToast } from './DestructiveActions'

describe('shared destructive actions', () => {
  it('renders the destructive icon button with an accessible name', async () => {
    const onClick = vi.fn()
    render(React.createElement(DestructiveIconButton, { label: 'Delete item', onClick }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete item' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('confirms, cancels with Escape, and shows busy state', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(React.createElement(ConfirmDestructiveActionDialog, { open: true, title: 'Remove milk?', explanation: 'History remains.', confirmLabel: 'Remove', busy: false, onCancel, onConfirm }))
    expect(screen.getByRole('dialog', { name: 'Remove milk?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('selects a recurring removal scope', async () => {
    const onSelect = vi.fn()
    render(React.createElement(RecurringDeleteScopeDialog, { open: true, title: 'Remove occurrence', explanation: 'Choose a scope.', onCancel: vi.fn(), onSelect }))
    fireEvent.click(screen.getByRole('button', { name: /following/i }))
    expect(onSelect).toHaveBeenCalledWith('following')
  })

  it('supports undo from the toast', async () => {
    const onUndo = vi.fn()
    render(React.createElement(UndoToast, { message: 'Milk removed', onUndo }))
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    expect(onUndo).toHaveBeenCalledOnce()
  })
})
