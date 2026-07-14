import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import { FamilyMark } from './FamilyMark'
import { translateAuthError } from '../lib/authErrors'
import { getAuthRedirectUrl } from '../lib/authRedirect'

type Mode = 'signIn' | 'signUp'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)

  const busy = submitting || googleSubmitting

  function switchMode(next: Mode) {
    if (busy) return
    setMode(next)
    setError(null)
    setConfirmPassword('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return

    if (!EMAIL_RE.test(email)) {
      setError(t.login.errors.invalidEmail)
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.login.errors.passwordTooShort)
      return
    }
    if (mode === 'signUp' && password !== confirmPassword) {
      setError(t.login.errors.passwordMismatch)
      return
    }

    setSubmitting(true)
    setError(null)

    const { error } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    setSubmitting(false)
    if (error) {
      setError(translateAuthError(error))
    }
    // On success the session listener (useSession) picks up the new
    // session and App.tsx moves on — nothing else to do here.
  }

  async function handleGoogle() {
    if (busy) return
    setGoogleSubmitting(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getAuthRedirectUrl() },
    })

    if (error) {
      console.error('Google sign-in error:', error.message)
      setError(t.login.errors.oauthFailed)
      setGoogleSubmitting(false)
    }
    // On success the browser navigates away to Google; no further action here.
  }

  return (
    <div className="auth-screen">
      <div className="brand-lockup">
        <FamilyMark variant="static" size={48} />
        <h1>{t.login.title}</h1>
      </div>
      <p className="claim">{t.claim}</p>

      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signIn'}
          className={`auth-tab${mode === 'signIn' ? ' active' : ''}`}
          onClick={() => switchMode('signIn')}
        >
          {t.login.tabSignIn}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signUp'}
          className={`auth-tab${mode === 'signUp' ? ' active' : ''}`}
          onClick={() => switchMode('signUp')}
        >
          {t.login.tabSignUp}
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          {t.login.emailLabel}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.login.emailPlaceholder}
          />
        </label>
        <label>
          {t.login.passwordLabel}
          <input
            type="password"
            required
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.login.passwordPlaceholder}
          />
        </label>
        {mode === 'signUp' && (
          <label>
            {t.login.confirmPasswordLabel}
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t.login.confirmPasswordPlaceholder}
            />
          </label>
        )}
        <button type="submit" disabled={busy}>
          {submitting
            ? t.login.submitting
            : mode === 'signIn'
              ? t.login.submitSignIn
              : t.login.submitSignUp}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="auth-divider">
        <span>{t.login.orDivider}</span>
      </div>

      <button type="button" className="google-button" onClick={handleGoogle} disabled={busy}>
        <GoogleIcon />
        {googleSubmitting ? t.login.googleSubmitting : t.login.googleButton}
      </button>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  )
}
