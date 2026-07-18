import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import {
  describeUpdateOutcome,
  getEmailChangeRedirectUrl,
  translateEmailChangeError,
  validateEmailChange,
} from '../lib/emailChange'

interface Props {
  currentEmail: string
  hasGoogleIdentity: boolean
  onDone: () => void
  /** Lets the account row pick up the new pending address once it exists. */
  onSubmitted?: () => void
}

// Changes the login email of the currently signed-in user through the normal
// Supabase confirmation flow: updateUser only ever acts on the caller's own
// session, so there is no admin call, no service role and no SQL involved.
// Until the link is confirmed Supabase keeps the old address active, which is
// why the success state promises a pending change rather than a done one.
export function ChangeEmailForm({ currentEmail, hasGoogleIdentity, onDone, onSubmitted }: Props) {
  const [newEmail, setNewEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Which of the two outcomes actually happened — see handleSubmit.
  const [result, setResult] = useState<{ kind: 'pending' | 'applied'; email: string } | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return

    const validation = validateEmailChange({ currentEmail, newEmail, confirmEmail })
    if (!validation.ok) {
      setError(validation.message)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const { data, error: updateError } = await supabase.auth.updateUser(
        { email: validation.email },
        { emailRedirectTo: getEmailChangeRedirectUrl() }
      )
      if (updateError) {
        setError(translateEmailChangeError(updateError))
        return
      }
      // Two legitimate outcomes, decided by the project's auth settings rather
      // than by us: with email confirmation enabled Supabase parks the address
      // in `new_email` and mails a link, but with "Confirm email" turned off it
      // applies the change on the spot. Reporting a pending confirmation in the
      // second case would be a lie, so the message follows the returned user.
      setResult(describeUpdateOutcome(data?.user, validation.email))
      onSubmitted?.()
    } catch (cause) {
      // Thrown rather than returned: offline, DNS failure, aborted request.
      setError(translateEmailChangeError(cause as { message?: string }))
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div>
        <p className="success">
          {result.kind === 'applied'
            ? t.more.changeEmailApplied(result.email)
            : t.more.changeEmailSent(result.email)}
        </p>
        {result.kind === 'pending' && <p className="modal-explain">{t.more.changeEmailSecureNote}</p>}
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t.common.close}
        </button>
      </div>
    )
  }

  return (
    // noValidate: the browser's native bubble would be in the browser's own
    // language and wording. Our inline, translated errors are the single
    // validation surface; type/required stay for semantics and mobile keyboards.
    <form onSubmit={handleSubmit} aria-busy={submitting} noValidate>
      <p className="modal-explain">{t.more.changeEmailExplain}</p>
      {hasGoogleIdentity && <p className="modal-explain">{t.more.changeEmailGoogleNote}</p>}

      <p className="change-email-current">
        <span className="more-setting-label">{t.more.currentEmailLabel}</span>
        <strong className="more-setting-value">{currentEmail}</strong>
      </p>

      <label>
        {t.more.newEmailLabel}
        <input
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
        />
      </label>
      <label>
        {t.more.confirmEmailLabel}
        <input
          type="email"
          required
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
        />
      </label>

      <div className="modal-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? t.more.changeEmailSubmitting : t.more.changeEmailSubmit}
        </button>
        <button type="button" className="btn-secondary" disabled={submitting} onClick={onDone}>
          {t.common.cancel}
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
