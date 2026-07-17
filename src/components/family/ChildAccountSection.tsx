import { useState } from 'react'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import type { ChildAccount } from '../../hooks/useChildAccounts'
import { t } from '../../strings'
import { getCurrentLanguage } from '../../i18n'
import { childAccountState, childAccountStatusLabel, type ChildAccountState } from '../../utils/childAccountStatus'
import { generateChildPassphrase } from '../../lib/childPassphrase'
import { resetChildPassword, revokeChildAccount } from '../../lib/childAccountAdmin'
import { childAccountErrorMessage } from '../../lib/childAccountErrors'
import { Modal } from '../ui/Modal'
import { ConfirmDestructiveActionDialog } from '../ui/DestructiveActions'
import { ChildAccountCreateDialog } from './ChildAccountCreateDialog'
import { ChildAccountCredentialCard } from './ChildAccountCredentialCard'

interface Props {
  child: FamilyMember
  account: ChildAccount | null
  onChanged: () => Promise<void> | void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(getCurrentLanguage() === 'cs' ? 'cs-CZ' : 'en-US')
}

function stateExplanation(state: ChildAccountState): string {
  const copy = t.family.childAccount
  if (state === 'active') return copy.activeExplain
  if (state === 'revoked') return copy.revokedExplain
  if (state === 'provisioning') return copy.provisioningExplain
  return copy.noneExplain
}

// The account panel inside a child's existing profile. Visibility is decided
// by the caller; this component still assumes nothing about authorization,
// because every action it offers is re-checked server-side.
export function ChildAccountSection({ child, account, onChanged }: Props) {
  const [creating, setCreating] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)
  const [resetCredentials, setResetCredentials] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const state = childAccountState(child, account)
  const copy = t.family.childAccount
  const loginName = account?.login_name ?? null

  async function handleReset() {
    if (busy) return
    setBusy(true)
    setError(null)
    const passphrase = generateChildPassphrase()
    try {
      await resetChildPassword(child.id, passphrase)
      setConfirmingReset(false)
      setResetCredentials(passphrase)
      await onChanged()
    } catch (resetError) {
      setError(childAccountErrorMessage(resetError))
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await revokeChildAccount(child.id)
      setConfirmingRevoke(false)
      // Family access is already gone even when the Auth user outlives the
      // request, so this reports the safe recoverable status rather than
      // presenting the whole operation as a failure.
      setNotice(result.cleanupPending ? copy.revokeCleanupPending : null)
      await onChanged()
    } catch (revokeError) {
      setError(childAccountErrorMessage(revokeError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="form-section child-account-section" aria-labelledby="child-account-title">
      <h4 id="child-account-title">{copy.sectionTitle}</h4>

      {/* Status is carried by text, not only by the badge colour. */}
      <p className={`child-account-status is-${state}`}>
        <span className="badge-dot" aria-hidden="true" />
        {childAccountStatusLabel(state)}
      </p>
      <p className="field-hint">{stateExplanation(state)}</p>

      {loginName && state !== 'none' && (
        <dl className="profile-readonly-grid">
          <div>
            <dt>{copy.loginNameLabel}</dt>
            <dd><code>{loginName}</code></dd>
          </div>
        </dl>
      )}

      <ul className="child-account-meta row-meta">
        {state === 'active' && account?.activated_at && <li>{copy.activatedLabel(formatDate(account.activated_at))}</li>}
        {state === 'active' && account?.password_reset_at && <li>{copy.passwordResetLabel(formatDate(account.password_reset_at))}</li>}
        {state === 'revoked' && account?.revoked_at && <li>{copy.revokedAtLabel(formatDate(account.revoked_at))}</li>}
      </ul>

      {/* Reset and revoke failures are rendered by their own dialog, which
          stays open so the parent can retry; repeating them here would show
          the same alert twice. */}
      {notice && <p className="info-note" role="status">{notice}</p>}

      <div className="family-actions">
        {(state === 'none' || state === 'revoked') && (
          <button type="button" disabled={busy} onClick={() => { setError(null); setNotice(null); setCreating(true) }}>
            {state === 'revoked' ? copy.reactivateAction : copy.createAction}
          </button>
        )}
        {state === 'active' && <>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setError(null); setConfirmingReset(true) }}>
            {copy.resetAction}
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            aria-label={copy.revokeActionFor(child.display_name)}
            onClick={() => { setError(null); setConfirmingRevoke(true) }}
          >
            {copy.revokeAction}
          </button>
        </>}
      </div>

      {creating && <ChildAccountCreateDialog
        child={child}
        onCreated={onChanged}
        onClose={() => setCreating(false)}
      />}

      <ConfirmDestructiveActionDialog
        open={confirmingReset}
        title={copy.resetTitle(child.display_name)}
        explanation={copy.resetExplain}
        objectName={child.display_name}
        confirmLabel={copy.resetConfirm}
        busy={busy}
        error={error}
        onCancel={() => { if (!busy) setConfirmingReset(false) }}
        onConfirm={handleReset}
      />

      <ConfirmDestructiveActionDialog
        open={confirmingRevoke}
        title={copy.revokeTitle(child.display_name)}
        explanation={copy.revokeExplain}
        objectName={child.display_name}
        consequences={[copy.revokeConsequence1, copy.revokeConsequence2, copy.revokeConsequence3]}
        confirmLabel={copy.revokeConfirm}
        busy={busy}
        error={error}
        onCancel={() => { if (!busy) setConfirmingRevoke(false) }}
        onConfirm={handleRevoke}
      />

      {resetCredentials && loginName && (
        <Modal
          title={copy.credentialTitle}
          onClose={() => setResetCredentials(null)}
          closeOnBackdrop={false}
        >
          <ChildAccountCredentialCard
            childName={child.display_name}
            loginName={loginName}
            passphrase={resetCredentials}
            onDone={() => setResetCredentials(null)}
          />
        </Modal>
      )}
    </section>
  )
}
