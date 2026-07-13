import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import { Logo } from './Logo'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="auth-screen">
        <div className="brand-lockup">
          <Logo size={44} />
          <h1>{t.login.checkEmailTitle}</h1>
        </div>
        <p>{t.login.checkEmailBody(email)}</p>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="brand-lockup">
        <Logo size={44} />
        <h1>{t.login.title}</h1>
      </div>
      <p className="claim">{t.claim}</p>
      <p>{t.login.subtitle}</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.login.emailPlaceholder}
        />
        <button type="submit" disabled={loading}>
          {loading ? t.login.submitting : t.login.submit}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
