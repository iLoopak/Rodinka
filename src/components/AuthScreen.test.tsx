// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../strings'

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
}

vi.mock('../supabaseClient', () => ({ supabase: { auth } }))

import { AuthScreen } from './AuthScreen'

describe('AuthScreen accessibility', () => {
  beforeEach(() => vi.clearAllMocks())

  it('supports expected tab keyboard navigation', () => {
    render(<AuthScreen />)
    const signIn = screen.getByRole('tab', { name: t.login.tabSignIn })
    const signUp = screen.getByRole('tab', { name: t.login.tabSignUp })
    signIn.focus()
    fireEvent.keyDown(signIn, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(signUp)
    expect(signUp.getAttribute('aria-selected')).toBe('true')
    expect(signIn.tabIndex).toBe(-1)
  })

  it('announces localized inline validation', () => {
    render(<AuthScreen />)
    fireEvent.change(screen.getByLabelText(t.login.emailLabel), { target: { value: 'invalid' } })
    fireEvent.change(screen.getByLabelText(t.login.passwordLabel), { target: { value: 'long-enough-password' } })
    fireEvent.click(screen.getByRole('button', { name: t.login.submitSignIn }))
    expect(screen.getByRole('alert').textContent).toBe(t.login.errors.invalidEmail)
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })
})
