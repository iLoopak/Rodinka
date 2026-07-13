import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

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
        <h1>{t.onboarding.welcomeTitle}</h1>
        <p>{t.onboarding.welcomeSubtitle}</p>
        <button onClick={() => setMode('create')}>{t.onboarding.createFamilyButton}</button>
        <button onClick={() => setMode('join')}>{t.onboarding.joinFamilyButton}</button>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="onboarding-screen">
        <h1>{t.onboarding.createTitle}</h1>
        <form onSubmit={handleCreate}>
          <label>
            {t.onboarding.familyNameLabel}
            <input
              required
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder={t.onboarding.familyNamePlaceholder}
            />
          </label>
          <label>
            {t.onboarding.yourNameLabel}
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t.onboarding.yourNamePlaceholder}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? t.onboarding.creating : t.onboarding.createSubmit}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <button className="link" onClick={() => setMode('choose')}>{t.onboarding.back}</button>
      </div>
    )
  }

  return (
    <div className="onboarding-screen">
      <h1>{t.onboarding.joinTitle}</h1>
      <form onSubmit={handleJoin}>
        <label>
          {t.onboarding.inviteCodeLabel}
          <input
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder={t.onboarding.inviteCodePlaceholder}
          />
        </label>
        <label>
          {t.onboarding.yourNameLabel}
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t.onboarding.yourNamePlaceholder}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? t.onboarding.joining : t.onboarding.joinSubmit}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <button className="link" onClick={() => setMode('choose')}>{t.onboarding.back}</button>
    </div>
  )
}
