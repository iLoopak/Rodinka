// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateRecordProvider, useCreateRecord } from './CreateRecordContext'

const createAction = vi.fn<() => Promise<void>>()

function Harness() {
  const create = useCreateRecord()
  return <>
    <output data-testid="state">
      {JSON.stringify({
        open: create.isOpen,
        step: create.currentStep,
        type: create.selectedType,
        date: create.context?.date,
        memberId: create.context?.memberId,
        dirty: create.isDirty,
        status: create.status,
      })}
    </output>
    <button onClick={() => create.openCreateRecord()}>generic</button>
    <button onClick={() => create.openCreateRecord({ type: 'medical', date: '2026-07-20', memberId: 'member-1' })}>contextual</button>
    <button onClick={() => create.selectRecordType('activity')}>activity</button>
    <button onClick={create.markDirty}>dirty</button>
    <button onClick={create.backToRecordTypes}>back</button>
    <button onClick={() => void create.runCreate(createAction)}>submit</button>
  </>
}

function state() {
  return JSON.parse(screen.getByTestId('state').textContent ?? '{}') as Record<string, unknown>
}

describe('CreateRecordProvider', () => {
  afterEach(cleanup)

  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
    createAction.mockReset()
  })

  it('supports generic and contextual creation through one controller', () => {
    render(<CreateRecordProvider><Harness /></CreateRecordProvider>)

    fireEvent.click(screen.getByText('generic'))
    expect(state()).toMatchObject({ open: true, step: 1, type: null })

    fireEvent.click(screen.getByText('activity'))
    expect(state()).toMatchObject({ open: true, step: 2, type: 'activity' })

    fireEvent.click(screen.getByText('contextual'))
    expect(state()).toMatchObject({
      open: true,
      step: 2,
      type: 'medical',
      date: '2026-07-20',
      memberId: 'member-1',
    })
  })

  it('warns before changing type when meaningful input is dirty', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CreateRecordProvider><Harness /></CreateRecordProvider>)

    fireEvent.click(screen.getByText('contextual'))
    fireEvent.click(screen.getByText('dirty'))
    fireEvent.click(screen.getByText('back'))
    expect(state()).toMatchObject({ type: 'medical', dirty: true })

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByText('back'))
    expect(state()).toMatchObject({ open: true, step: 1, type: null, dirty: false })
  })

  it('guards the shared submit lifecycle against duplicate creation', async () => {
    let finish: (() => void) | undefined
    createAction.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    render(<CreateRecordProvider><Harness /></CreateRecordProvider>)

    fireEvent.click(screen.getByText('contextual'))
    fireEvent.click(screen.getByText('submit'))
    fireEvent.click(screen.getByText('submit'))

    expect(createAction).toHaveBeenCalledTimes(1)
    expect(state()).toMatchObject({ status: 'submitting' })

    finish?.()
    await waitFor(() => expect(state().status).not.toBe('submitting'))
  })
})
