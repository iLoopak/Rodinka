import { useState } from 'react'
import { supabase } from '../supabaseClient'

interface Props {
  onDone: () => void
}

export function OnboardingScreen({ onDone }: Props) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [displayName, setDisplayName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.rpc('create_family', {
      family_name: familyName,
      admin_display_name: displayName,
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      onDone()
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.rpc('redeem_invite', {
      invite_code: inviteCode.trim().toUpperCase(),
      display_name: displayName,
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      onDone()
    }
  }

  if (mode === 'choose') {
    return (
      <div className="onboarding-screen">
        <h1>Welcome!</h1>
        <p>Are you starting a new family, or joining one that already exists?</p>
        <button onClick={() => setMode('create')}>Create a new family</button>
        <button onClick={() => setMode('join')}>I have an invite code</button>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="onboarding-screen">
        <h1>Create your family</h1>
        <form onSubmit={handleCreate}>
          <label>
            Family name
            <input
              required
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="e.g. The Novaks"
            />
          </label>
          <label>
            Your name
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Lukáš"
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create family'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <button className="link" onClick={() => setMode('choose')}>Back</button>
      </div>
    )
  }

  return (
    <div className="onboarding-screen">
      <h1>Join a family</h1>
      <form onSubmit={handleJoin}>
        <label>
          Invite code
          <input
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="e.g. SUNNY-42"
          />
        </label>
        <label>
          Your name
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Partner's name"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Joining...' : 'Join family'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <button className="link" onClick={() => setMode('choose')}>Back</button>
    </div>
  )
}
