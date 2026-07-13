import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import { translateAuthError } from '../lib/authErrors'

const MIN_PASSWORD_LENGTH = 8

interface Props {
  onDone: () => void
}

// Lets an already-signed-in user (e.g. one who has only ever used a magic
// link or Google) add a password without any email round-trip. Works via
// updateUser on the current session, so it never touches auth.users.id or
// creates a second account.
export function SetPasswordForm({ onDone }: Props) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.login.errors.passwordTooShort)
      return
    }
    if (password !== confirmPassword) {
      setError(t.login.errors.passwordMismatch)
      return
    }

    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(translateAuthError(error))
    } else {
      setSuccess(true)
      setPassword('')
      setConfirmPassword('')
    }
  }

  if (success) {
    return (
      <div>
        <p className="success">{t.more.passwordSetSuccess}</p>
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t.chores.close}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="modal-explain">{t.more.setPasswordExplain}</p>
      <label>
        {t.more.newPasswordLabel}
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label>
        {t.more.confirmPasswordLabel}
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? t.more.settingPassword : t.more.setPasswordSubmit}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
