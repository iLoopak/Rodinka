import { useState } from 'react'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { t } from '../../strings'
import { isValidChildLoginName, normalizeChildLoginName } from '../../lib/childAccountIdentity'
import { generateChildPassphrase, isValidChildPassword } from '../../lib/childPassphrase'
import { suggestChildLoginName } from '../../lib/childLoginSuggestion'
import { provisionChildAccount } from '../../lib/childAccountAdmin'
import { childAccountErrorMessage } from '../../lib/childAccountErrors'
import { Modal } from '../ui/Modal'
import { ChildAccountCredentialCard } from './ChildAccountCredentialCard'

interface Props {
  child: FamilyMember
  onCreated: () => Promise<void> | void
  onClose: () => void
}

interface Credentials {
  loginName: string
  passphrase: string
}

export function ChildAccountCreateDialog({ child, onCreated, onClose }: Props) {
  const [loginName, setLoginName] = useState(() => suggestChildLoginName(child.display_name))
  const [passphrase, setPassphrase] = useState(() => generateChildPassphrase())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)

  const normalizedLogin = normalizeChildLoginName(loginName)
  const canSubmit = isValidChildLoginName(normalizedLogin) && isValidChildPassword(passphrase)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    // Guards the in-flight window: a double submit would otherwise try to
    // provision twice and the second call would fail as a name clash.
    if (busy || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const result = await provisionChildAccount(child.id, normalizedLogin, passphrase)
      // Only now does the secret become displayable, and only from state that
      // this dialog drops on close.
      setCredentials({ loginName: result.loginName, passphrase })
      await onCreated()
    } catch (submitError) {
      setError(childAccountErrorMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  function handleClose() {
    // Explicitly drop the secret rather than relying on unmount alone.
    setPassphrase('')
    setCredentials(null)
    onClose()
  }

  if (credentials) {
    return (
      <Modal title={t.family.childAccount.credentialTitle} onClose={handleClose} closeOnBackdrop={false}>
        <ChildAccountCredentialCard
          childName={child.display_name}
          loginName={credentials.loginName}
          passphrase={credentials.passphrase}
          onDone={handleClose}
        />
      </Modal>
    )
  }

  return (
    <Modal
      title={t.family.childAccount.createTitle(child.display_name)}
      onClose={busy ? () => undefined : handleClose}
      closeOnBackdrop={false}
    >
      <form onSubmit={handleSubmit}>
        <p className="modal-explain">{t.family.childAccount.createExplain}</p>

        <label>
          {t.family.childAccount.loginNameLabel}
          <input
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            onBlur={() => setLoginName(normalizedLogin)}
            disabled={busy}
            required
            autoComplete="off"
            maxLength={32}
          />
        </label>
        <p className="field-hint">{t.family.childAccount.loginNameHelp}</p>

        <label>
          {t.family.childAccount.passphraseLabel}
          <input
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            disabled={busy}
            required
            // A generated passphrase is meant to be read aloud and typed by a
            // child, so it is visible here. Managers never store it, and the
            // browser must not offer to either.
            autoComplete="off"
            maxLength={128}
          />
        </label>
        <p className="field-hint">{t.family.childAccount.passphraseHelp}</p>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => setPassphrase(generateChildPassphrase())}
        >
          {t.family.childAccount.generateAnother}
        </button>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={handleClose}>{t.common.cancel}</button>
          <button type="submit" disabled={busy || !canSubmit}>
            {busy ? t.family.childAccount.creating : t.family.childAccount.createSubmit}
          </button>
        </div>
      </form>
    </Modal>
  )
}
