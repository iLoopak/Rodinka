// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../strings'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
}))

vi.mock('../supabaseClient', () => ({ supabase: { auth } }))

import { AuthScreen } from './AuthScreen'

describe('AuthScreen accessibility', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('supports expected tab keyboard navigation', () => {
    render(<AuthScreen />)
    const signIn = screen.getByRole('tab', { name: t.login.tabSignIn })
    const signUp = screen.getByRole('tab', { name: t.login.tabSignUp })
    const child = screen.getByRole('tab', { name: t.login.tabChild })
    signIn.focus()
    fireEvent.keyDown(signIn, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(signUp)
    expect(signUp.getAttribute('aria-selected')).toBe('true')
    expect(signIn.tabIndex).toBe(-1)
    fireEvent.keyDown(signUp, { key: 'End' })
    expect(document.activeElement).toBe(child)
    expect(child.getAttribute('aria-selected')).toBe('true')
  })

  it('announces localized inline validation', () => {
    render(<AuthScreen />)
    fireEvent.change(screen.getByLabelText(t.login.emailLabel), { target: { value: 'invalid' } })
    fireEvent.change(screen.getByLabelText(t.login.passwordLabel), { target: { value: 'long-enough-password' } })
    fireEvent.submit(screen.getByRole('tabpanel', { name: t.login.tabSignIn }))
    expect(screen.getByRole('alert').textContent).toBe(t.login.errors.invalidEmail)
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('maps a child login name to the internal identifier without exposing it', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null })
    render(<AuthScreen />)
    fireEvent.click(screen.getByRole('tab', { name: t.login.tabChild }))
    fireEvent.change(screen.getByLabelText(t.login.childLoginNameLabel), { target: { value: 'Žofka Nováková' } })
    fireEvent.change(screen.getByLabelText(t.login.passwordLabel), { target: { value: 'friendly-passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: t.login.submitChildSignIn }))
    await vi.waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'child.zofka-novakova@children.rodinka.invalid',
      password: 'friendly-passphrase',
    }))
    expect(document.body.textContent).not.toContain('children.rodinka.invalid')
  })

  it('uses one safe error for all child credential failures', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'User not found' } })
    render(<AuthScreen />)
    fireEvent.click(screen.getByRole('tab', { name: t.login.tabChild }))
    fireEvent.change(screen.getByLabelText(t.login.childLoginNameLabel), { target: { value: 'zofka-7' } })
    fireEvent.change(screen.getByLabelText(t.login.passwordLabel), { target: { value: 'friendly-passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: t.login.submitChildSignIn }))
    expect((await screen.findByRole('alert')).textContent).toBe(t.login.errors.childCredentialsInvalid)
  })
})
