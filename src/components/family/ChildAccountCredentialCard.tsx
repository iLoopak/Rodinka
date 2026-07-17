import { useState } from 'react'
import { t } from '../../strings'

interface Props {
  childName: string
  loginName: string
  passphrase: string
  onDone: () => void
}

type CopyTarget = 'loginName' | 'passphrase'

// Shown exactly once, immediately after the server confirms a provision or a
// reset. The passphrase lives only in the caller's component state and is
// dropped when this card closes — there is no way to render it again, by
// design. Nothing here writes to storage, the URL, or the console.
export function ChildAccountCredentialCard({ childName, loginName, passphrase, onDone }: Props) {
  const [copied, setCopied] = useState<CopyTarget | null>(null)

  async function copy(value: string, target: CopyTarget) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(target)
    } catch {
      // Clipboard access fails on insecure contexts and when permission is
      // denied. Both values stay on screen for manual entry, so this is not
      // worth surfacing as an error.
    }
  }

  return (
    <div className="child-credential-card">
      <p className="child-credential-warning" role="alert">{t.family.childAccount.credentialWarning}</p>

      <dl className="child-credential-grid">
        <div>
          <dt>{t.family.childAccount.loginNameLabel}</dt>
          <dd>
            <code className="child-credential-value">{loginName}</code>
            <button
              type="button"
              className="btn-secondary"
              aria-label={t.family.childAccount.copyLoginNameFor(childName)}
              onClick={() => void copy(loginName, 'loginName')}
            >
              {copied === 'loginName' ? t.family.childAccount.copied : t.family.childAccount.copyLoginName}
            </button>
          </dd>
        </div>
        <div>
          <dt>{t.family.childAccount.passphraseLabel}</dt>
          <dd>
            <code className="child-credential-value">{passphrase}</code>
            <button
              type="button"
              className="btn-secondary"
              aria-label={t.family.childAccount.copyPassphraseFor(childName)}
              onClick={() => void copy(passphrase, 'passphrase')}
            >
              {copied === 'passphrase' ? t.family.childAccount.copied : t.family.childAccount.copyPassphrase}
            </button>
          </dd>
        </div>
      </dl>

      <p aria-live="polite" className="visually-hidden">
        {copied ? t.family.childAccount.copied : ''}
      </p>
      <p className="field-hint">{t.family.childAccount.childInstruction}</p>
      <div className="modal-actions">
        <button type="button" onClick={onDone}>{t.family.childAccount.credentialDone}</button>
      </div>
    </div>
  )
}
