// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../strings'

const signOut = vi.hoisted(() => vi.fn())
vi.mock('../supabaseClient', () => ({ supabase: { auth: { signOut } } }))

import { UnlinkedChildAccountScreen } from './UnlinkedChildAccountScreen'

describe('UnlinkedChildAccountScreen', () => {
  afterEach(cleanup)

  it('shows a safe recovery state and allows signing out', () => {
    render(<UnlinkedChildAccountScreen />)
    expect(screen.getByRole('heading', { name: t.login.childAccessUnavailableTitle })).toBeTruthy()
    expect(screen.getByText(t.login.childAccessUnavailableBody)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t.dashboard.signOut }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})
