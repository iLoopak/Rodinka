import { useState } from 'react'
import { supabase } from '../supabaseClient'

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
        <h1>Check your email</h1>
        <p>We sent a login link to {email}. Click it to continue.</p>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <h1>Family Organizer</h1>
      <p>Enter your email to sign in — no password needed.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send magic link'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
