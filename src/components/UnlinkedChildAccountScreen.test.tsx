// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../strings'

const signOut = vi.hoisted(() => vi.fn())
const releasePushOnSignOut = vi.hoisted(() => vi.fn(async () => false))
vi.mock('../supabaseClient', () => ({ supabase: { auth: { signOut } } }))
vi.mock('../push/releaseOnSignOut', () => ({ releasePushOnSignOut }))

import { UnlinkedChildAccountScreen } from './UnlinkedChildAccountScreen'

describe('UnlinkedChildAccountScreen', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows a safe recovery state and allows signing out', async () => {
    render(<UnlinkedChildAccountScreen />)
    expect(screen.getByRole('heading', { name: t.login.childAccessUnavailableTitle })).toBeTruthy()
    expect(screen.getByText(t.login.childAccessUnavailableBody)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t.dashboard.signOut }))
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
  })

  // The device's push subscription must be released BEFORE the session
  // goes away, otherwise the revoke RPC runs unauthenticated and the row
  // keeps pointing at the signed-out user.
  it('releases this device push subscription before signing out', async () => {
    render(<UnlinkedChildAccountScreen />)
    fireEvent.click(screen.getByRole('button', { name: t.dashboard.signOut }))
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce())
    expect(releasePushOnSignOut).toHaveBeenCalledOnce()
    expect(releasePushOnSignOut.mock.invocationCallOrder[0])
      .toBeLessThan(signOut.mock.invocationCallOrder[0])
  })
})
