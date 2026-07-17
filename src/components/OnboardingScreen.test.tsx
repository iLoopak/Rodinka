// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../strings'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../supabaseClient', () => ({ supabase: { rpc } }))

import { OnboardingScreen } from './OnboardingScreen'

describe('OnboardingScreen release states', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('communicates progress and never renders a raw create-family error', async () => {
    rpc.mockResolvedValue({ error: { message: 'duplicate key violates families_pkey (family_id=uuid)' } })
    render(<OnboardingScreen onDone={vi.fn()} />)
    expect(screen.getByText(t.onboarding.chooseStep)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t.onboarding.createFamilyButton }))
    expect(screen.getByText(t.onboarding.detailsStep)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t.onboarding.familyNameLabel), { target: { value: 'Test family' } })
    fireEvent.change(screen.getByLabelText(t.onboarding.yourNameLabel), { target: { value: 'Test user' } })
    fireEvent.click(screen.getByRole('button', { name: t.onboarding.createSubmit }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(t.onboarding.errors.createFailed)
    expect(alert.textContent).not.toContain('family_id')
  })

  it('uses a localized invite-code failure', async () => {
    rpc.mockResolvedValue({ error: { message: 'Invite code invalid or expired' } })
    render(<OnboardingScreen onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: t.onboarding.joinFamilyButton }))
    fireEvent.change(screen.getByLabelText(t.onboarding.inviteCodeLabel), { target: { value: 'BAD-CODE' } })
    fireEvent.change(screen.getByLabelText(t.onboarding.yourNameLabel), { target: { value: 'Test user' } })
    fireEvent.click(screen.getByRole('button', { name: t.onboarding.joinSubmit }))
    expect((await screen.findByRole('alert')).textContent).toBe(t.onboarding.errors.invalidInvite)
  })
})
