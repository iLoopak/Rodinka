// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../strings'

const auth = vi.hoisted(() => ({ updateUser: vi.fn() }))

vi.mock('../supabaseClient', () => ({ supabase: { auth } }))

import { ChangeEmailForm } from './ChangeEmailForm'

const currentEmail = 'rodic@example.com'

function renderForm(overrides: Partial<Parameters<typeof ChangeEmailForm>[0]> = {}) {
  const onDone = vi.fn()
  render(
    <ChangeEmailForm
      currentEmail={currentEmail}
      hasGoogleIdentity={false}
      onDone={onDone}
      {...overrides}
    />
  )
  return { onDone }
}

function fillIn(newEmail: string, confirmEmail = newEmail) {
  fireEvent.change(screen.getByLabelText(t.more.newEmailLabel), { target: { value: newEmail } })
  fireEvent.change(screen.getByLabelText(t.more.confirmEmailLabel), { target: { value: confirmEmail } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: t.more.changeEmailSubmit }))
}

describe('ChangeEmailForm', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('shows the address the account currently uses', () => {
    renderForm()
    expect(screen.getByText(currentEmail)).toBeTruthy()
  })

  it('rejects an invalid email format without calling Supabase', () => {
    renderForm()
    fillIn('neplatny-email')
    submit()
    expect(screen.getByRole('alert').textContent).toBe(t.more.changeEmailErrors.invalidEmail)
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('rejects a confirmation that does not match', () => {
    renderForm()
    fillIn('novy@example.com', 'jiny@example.com')
    submit()
    expect(screen.getByRole('alert').textContent).toBe(t.more.changeEmailErrors.mismatch)
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('rejects the address already in use by this account', () => {
    renderForm()
    fillIn(currentEmail)
    submit()
    expect(screen.getByRole('alert').textContent).toBe(t.more.changeEmailErrors.sameAsCurrent)
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('calls updateUser once with the normalized address and a redirect back into the app', async () => {
    auth.updateUser.mockResolvedValue({ error: null })
    const onSubmitted = vi.fn()
    renderForm({ onSubmitted })
    fillIn('  Novy@Example.COM  ', 'novy@example.com')
    submit()

    await vi.waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(1))
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: 'novy@example.com' },
      { emailRedirectTo: 'http://localhost:3000/more' }
    )
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalled())
  })

  it('cannot be submitted twice while a request is in flight', async () => {
    let release: (value: { error: null }) => void = () => {}
    auth.updateUser.mockReturnValue(new Promise((resolve) => { release = resolve }))
    renderForm()
    fillIn('novy@example.com')

    submit()
    const submitButton = await screen.findByRole('button', { name: t.more.changeEmailSubmitting })
    expect((submitButton as HTMLButtonElement).disabled).toBe(true)
    // A second click while pending must not fire another email send.
    fireEvent.click(submitButton)
    expect(auth.updateUser).toHaveBeenCalledTimes(1)

    release({ error: null })
    await screen.findByText(t.more.changeEmailSent('novy@example.com'))
  })

  it('reports a pending confirmation rather than claiming the address changed', async () => {
    // Supabase parked the address and mailed a link: the old one still signs in.
    auth.updateUser.mockResolvedValue({
      data: { user: { email: currentEmail, new_email: 'novy@example.com' } },
      error: null,
    })
    renderForm()
    fillIn('novy@example.com')
    submit()

    expect(await screen.findByText(t.more.changeEmailSent('novy@example.com'))).toBeTruthy()
    // Secure email change may need both mailboxes confirmed; say so up front.
    expect(screen.getByText(t.more.changeEmailSecureNote)).toBeTruthy()
    // The form is gone, so the new address cannot be resubmitted by mistake.
    expect(screen.queryByLabelText(t.more.newEmailLabel)).toBeNull()
  })

  it('does not promise a confirmation email when the change already took effect', async () => {
    // A project with "Confirm email" off applies the change immediately, so
    // telling the user to check their inbox would leave them waiting forever.
    auth.updateUser.mockResolvedValue({ data: { user: { email: 'novy@example.com' } }, error: null })
    renderForm()
    fillIn('novy@example.com')
    submit()

    expect(await screen.findByText(t.more.changeEmailApplied('novy@example.com'))).toBeTruthy()
    expect(screen.queryByText(t.more.changeEmailSecureNote)).toBeNull()
  })

  it('translates a taken address into readable copy', async () => {
    auth.updateUser.mockResolvedValue({
      error: { code: 'email_exists', message: 'A user with this email address has already been registered' },
    })
    renderForm()
    fillIn('obsazeny@example.com')
    submit()

    expect((await screen.findByRole('alert')).textContent).toBe(t.more.changeEmailErrors.emailTaken)
    expect(document.body.textContent).not.toContain('already been registered')
  })

  it('translates an expired session and lets the user retry', async () => {
    auth.updateUser.mockResolvedValue({ error: { message: 'Auth session missing!' } })
    renderForm()
    fillIn('novy@example.com')
    submit()

    expect((await screen.findByRole('alert')).textContent).toBe(t.more.changeEmailErrors.sessionExpired)
    // Still on the form, not stuck in a disabled state.
    expect((screen.getByRole('button', { name: t.more.changeEmailSubmit }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('translates a thrown network failure', async () => {
    auth.updateUser.mockRejectedValue(new TypeError('Failed to fetch'))
    renderForm()
    fillIn('novy@example.com')
    submit()

    expect((await screen.findByRole('alert')).textContent).toBe(t.more.changeEmailErrors.network)
  })

  it('explains the Google case without claiming the Google account changes', () => {
    renderForm({ hasGoogleIdentity: true })
    const note = screen.getByText(t.more.changeEmailGoogleNote)
    expect(note).toBeTruthy()
    expect(note.textContent).toContain('Google')
  })

  it('omits the Google note for an email/password account', () => {
    renderForm()
    expect(screen.queryByText(t.more.changeEmailGoogleNote)).toBeNull()
  })

  it('closes without sending anything when cancelled', () => {
    const { onDone } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }))
    expect(onDone).toHaveBeenCalled()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })
})
