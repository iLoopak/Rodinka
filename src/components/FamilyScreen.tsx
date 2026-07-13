import { useState } from 'react'
import { t, currentLang } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { AddChildForm } from './AddChildForm'
import { ErrorState } from './ui/ErrorState'
import { Modal } from './ui/Modal'
import type { FamilyMember } from '../hooks/useFamilyMembers'

function roleLabel(role: FamilyMember['role']) {
  if (role === 'admin') return t.family.roleAdmin
  if (role === 'parent') return t.family.roleParent
  return t.family.roleChild
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(currentLang === 'cs' ? 'cs-CZ' : 'en-US')
}

export function FamilyScreen() {
  const { familyName, members, isParentOrAdmin, addChild, createInvite, loading, error, refreshAll } =
    useFamilyData()
  const [showAddChild, setShowAddChild] = useState(false)
  const [showInvite, setShowInvite] = useState(false)

  if (loading) {
    return <p className="loading">{t.loading.generic}</p>
  }

  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />
  }

  return (
    <>
      <div className="home-header">
        <h1 className="home-title">{familyName ?? t.family.title}</h1>
      </div>

      <section className="section accent-sky">
        <h2>{t.family.membersTitle}</h2>
        <ul className="section-list">
          {members.map((m) => (
            <li key={m.id}>
              <span className="row-title">{m.display_name}</span>
              <span className="row-meta">{roleLabel(m.role)}</span>
              <span className="row-spacer" />
              <span className={`badge ${m.user_id ? 'badge-done' : 'badge-pending'}`}>
                {m.user_id ? t.family.hasAccount : t.family.noAccount}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isParentOrAdmin && (
        <section className="section accent-lavender">
          <div className="family-actions">
            <button className="btn-secondary" onClick={() => setShowAddChild(true)}>
              {t.family.addChildAction}
            </button>
            <button className="btn-secondary" onClick={() => setShowInvite(true)}>
              {t.family.inviteParentAction}
            </button>
          </div>
        </section>
      )}

      {showAddChild && (
        <Modal title={t.chores.addChildTitle} onClose={() => setShowAddChild(false)}>
          <AddChildForm
            onSubmit={async (displayName) => {
              await addChild(displayName)
              setShowAddChild(false)
            }}
          />
        </Modal>
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} createInvite={createInvite} />}
    </>
  )
}

interface InviteModalProps {
  onClose: () => void
  createInvite: () => Promise<{ code: string; expiresAt: string | null }>
}

function InviteModal({ onClose, createInvite }: InviteModalProps) {
  const [invite, setInvite] = useState<{ code: string; expiresAt: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const result = await createInvite()
      setInvite(result)
      setCopied(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(invite.code)
      setCopied(true)
    } catch {
      // Clipboard access can fail (permissions, insecure context); the code
      // is still visible on screen for manual copy.
    }
  }

  return (
    <Modal title={t.family.inviteModalTitle} onClose={onClose}>
      <p className="modal-explain">{t.family.inviteExplain}</p>

      {!invite ? (
        <button onClick={handleGenerate} disabled={loading}>
          {loading ? t.family.inviteGenerating : t.family.inviteGenerate}
        </button>
      ) : (
        <div className="invite-result">
          <div className="invite-code">{invite.code}</div>
          {invite.expiresAt && <p className="row-meta">{t.family.inviteExpiresLabel(formatDate(invite.expiresAt))}</p>}
          <div className="family-actions">
            <button className="btn-secondary" onClick={handleCopy}>
              {copied ? t.family.inviteCopied : t.family.inviteCopy}
            </button>
            <button className="btn-secondary" onClick={handleGenerate} disabled={loading}>
              {t.family.generateAnother}
            </button>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </Modal>
  )
}
