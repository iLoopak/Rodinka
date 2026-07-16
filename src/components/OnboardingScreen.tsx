import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import { FamilyMark } from './FamilyMark'

function onboardingError(error: { message?: string } | null, mode: 'create' | 'join') {
  console.error('Onboarding request failed:', error?.message)
  if (mode === 'join' && error?.message?.toLowerCase().includes('invite code')) return t.onboarding.errors.invalidInvite
  return mode === 'create' ? t.onboarding.errors.createFailed : t.onboarding.errors.joinFailed
}

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
      setError(onboardingError(error, 'create'))
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
      setError(onboardingError(error, 'join'))
    } else {
      onDone()
    }
  }

  if (mode === 'choose') {
    return (
      <div className="auth-screen">
        <div className="brand-lockup">
          <FamilyMark variant="static" size={48} />
          <h1>{t.onboarding.welcomeTitle}</h1>
        </div>
        <p>{t.onboarding.welcomeSubtitle}</p>
        <p className="onboarding-progress">{t.onboarding.chooseStep}</p>
        <button type="button" onClick={() => setMode('create')}>{t.onboarding.createFamilyButton}</button>
        <button type="button" className="btn-secondary" onClick={() => setMode('join')}>
          {t.onboarding.joinFamilyButton}
        </button>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="auth-screen">
        <div className="brand-lockup"><FamilyMark variant="static" size={40} /><h1>{t.onboarding.createTitle}</h1></div>
        <p className="onboarding-progress">{t.onboarding.detailsStep}</p>
        <form aria-busy={loading} aria-describedby={error ? 'onboarding-create-error' : undefined} onSubmit={handleCreate}>
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
        {error && <p id="onboarding-create-error" className="error" role="alert">{error}</p>}
        <button type="button" className="link" disabled={loading} onClick={() => setMode('choose')}>{t.onboarding.back}</button>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="brand-lockup"><FamilyMark variant="static" size={40} /><h1>{t.onboarding.joinTitle}</h1></div>
      <p className="onboarding-progress">{t.onboarding.detailsStep}</p>
      <form aria-busy={loading} aria-describedby={error ? 'onboarding-join-error' : undefined} onSubmit={handleJoin}>
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
      {error && <p id="onboarding-join-error" className="error" role="alert">{error}</p>}
      <button type="button" className="link" disabled={loading} onClick={() => setMode('choose')}>{t.onboarding.back}</button>
    </div>
  )
}
