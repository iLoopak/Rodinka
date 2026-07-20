// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateRecordProvider, useCreateRecord } from '../../context/create-record/CreateRecordContext'

const mocks = vi.hoisted(() => ({ bodyRender: vi.fn() }))

vi.mock('./CreateRecordWizard', async () => {
  const context = await import('../../context/create-record/CreateRecordContext')
  return {
    CreateRecordWizard: () => {
      mocks.bodyRender()
      const create = context.useCreateRecord()
      return <div>Wizard body: {create.selectedType}</div>
    },
  }
})

import { CreateRecordWizardController } from './CreateRecordWizardController'

function OpenWizard() {
  const create = useCreateRecord()
  return <button type="button" onClick={() => create.openCreateRecord({ type: 'medical', memberId: 'member-7' })}>Open wizard</button>
}

afterEach(() => {
  cleanup()
  mocks.bodyRender.mockClear()
  window.history.replaceState(null, '', '/')
})

describe('CreateRecordWizardController', () => {
  it('does not load or mount the wizard body while closed', () => {
    render(<CreateRecordProvider><OpenWizard /><CreateRecordWizardController /></CreateRecordProvider>)
    expect(mocks.bodyRender).not.toHaveBeenCalled()
    expect(screen.queryByText(/Wizard body/)).toBeNull()
  })

  it('lazy-loads the body after opening and preserves contextual state', async () => {
    render(<CreateRecordProvider><OpenWizard /><CreateRecordWizardController /></CreateRecordProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Open wizard' }))
    expect(await screen.findByText('Wizard body: medical')).toBeTruthy()
    expect(mocks.bodyRender).toHaveBeenCalledTimes(1)
  })
})
