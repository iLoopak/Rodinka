import { useEffect, useState } from 'react'
import { t } from '../strings'
import { getCurrentLanguage } from '../i18n'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../context/family/FamilyMembersContext'
import { useFamilySettings } from '../context/family/FamilySettingsContext'
import { useChoresData } from '../context/chores/ChoresContext'
import { useActivitiesData } from '../context/activities/ActivitiesContext'
import { useOccurrenceAssignmentsData } from '../context/activities/OccurrenceAssignmentsContext'
import { AddChildForm } from './AddChildForm'
import { ErrorState } from './ui/ErrorState'
import { Modal } from './ui/Modal'
import { MemberAvatar } from './ui/MemberAvatar'
import { MemberProfileModal } from './family/MemberProfileModal'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { canEditMemberProfile } from '../utils/memberProfilePermissions'
import { FamilyMark } from './FamilyMark'
import { MemberRemovalDialog } from './family/MemberRemovalDialog'
import { ScreenHeader } from './ui/ScreenHeader'
import { ArchivedItemBadge, ConfirmDestructiveActionDialog, DestructiveIconButton } from './ui/DestructiveActions'
import { useChildAccounts, type ChildAccount } from '../hooks/useChildAccounts'
import { useFamilyMemberEmails } from '../hooks/useFamilyMemberEmails'
import { childAccountState, childAccountStatusLabel } from '../utils/childAccountStatus'
import { revokeChildAccount } from '../lib/childAccountAdmin'
import { AppToolbarAddButton } from '../components/ui/AddAction'

function roleLabel(role: FamilyMember['role']) {
  if (role === 'admin') return t.family.roleAdmin
  if (role === 'parent') return t.family.roleParent
  return t.family.roleChild
}

// Compact enough for the member row, but carries the canonical account state
// for children instead of the old has-account/no-account split. Adults have no
// managed account, so they keep the plain account-link wording.
function MemberAccountBadge({ member, account }: { member: FamilyMember; account: ChildAccount | null }) {
  if (member.role !== 'child') {
    // The authenticated-account link (members.user_id) is the source of truth —
    // never the role, name, or mere existence of the member profile.
    return <span className={`badge ${member.user_id ? 'badge-done' : 'badge-pending'}`}>
      {member.user_id ? t.family.accountLinked : t.family.emailNoAccount}
    </span>
  }
  const state = childAccountState(member, account)
  const tone = state === 'active' ? 'badge-done' : state === 'revoked' ? 'badge-revoked' : 'badge-pending'
  return <span className={`badge ${tone}`}>{childAccountStatusLabel(state)}</span>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(getCurrentLanguage() === 'cs' ? 'cs-CZ' : 'en-US')
}

export function FamilyScreen() {
  const { familyId, currentMember, isParentOrAdmin } = useFamilyCore()
  const {
    members, allMembers, addChild, createInvite, removeMember, leaveHousehold: leaveHouseholdRaw, restoreMember, permanentlyDeleteRemovedMember,
    membersLoading, membersError, refreshMembers,
  } = useFamilyMembersData()
  const { familyName, familyNameLoading, familyNameError, updateFamilyName } = useFamilySettings()
  const { chores, refreshChores } = useChoresData()
  const { activities, refreshActivities } = useActivitiesData()
  const { refreshOccurrenceAssignments } = useOccurrenceAssignmentsData()

  const childMemberIds = allMembers.filter((candidate) => candidate.role === 'child').map((candidate) => candidate.id)
  const childAccessSignature = allMembers
    .filter((candidate) => candidate.role === 'child')
    .map((candidate) => `${candidate.id}:${candidate.user_id ?? ''}:${candidate.status ?? 'active'}`)
    .sort()
    .join(',')
  const { accounts: childAccounts, refresh: refreshChildAccounts } = useChildAccounts(childMemberIds, isParentOrAdmin, childAccessSignature)

  // Adult account emails, readable only by adults of the same family (enforced
  // server-side by the family_member_emails RPC). Children never appear here.
  const { emails: memberEmails } = useFamilyMemberEmails(familyId, isParentOrAdmin)

  // members.user_id is the canonical access link and already arrives over
  // Realtime, so a revoke performed by another adult flips the status here
  // without a reload. Refetch the account rows too, for the login name and
  // lifecycle timestamps that only child_accounts carries.
  const loading = membersLoading || familyNameLoading
  const error = membersError || familyNameError
  async function refreshAll() {
    await Promise.all([refreshMembers(), refreshChores(), refreshActivities(), refreshOccurrenceAssignments(), refreshChildAccounts()])
  }

  async function handleRemoveMember(memberId: string, replacementMemberId: string | null, taskStrategy: 'unassign' | 'reassign', activityStrategy: 'clear' | 'reassign') {
    const target = allMembers.find((candidate) => candidate.id === memberId)
    // remove_household_member already detaches members.user_id, revokes push,
    // and blocks family access on its own — it is the trusted workflow here.
    // Revoking first only adds what it cannot do: delete the orphaned Auth
    // user, which keeps the login name reusable for a later re-provision.
    //
    // So this is best-effort. If the Edge Function is unreachable, removing
    // the child still has to succeed: blocking it would leave an adult unable
    // to remove a member while the function is down, and the removal itself
    // is what actually cuts off access.
    if (target?.role === 'child' && target.user_id) {
      try {
        await revokeChildAccount(memberId)
      } catch (revokeError) {
        console.error('Child Auth cleanup before removal did not complete:', revokeError instanceof Error ? revokeError.message : 'unknown')
      }
    }
    await removeMember(memberId, replacementMemberId, taskStrategy, activityStrategy)
    await Promise.all([refreshChores(), refreshActivities(), refreshOccurrenceAssignments(), refreshChildAccounts()])
  }

  async function handleRestoreMember(memberId: string) {
    await restoreMember(memberId)
    await Promise.all([refreshChores(), refreshActivities(), refreshOccurrenceAssignments()])
  }

  function leaveHousehold(replacementMemberId: string | null, taskStrategy: 'unassign' | 'reassign', activityStrategy: 'clear' | 'reassign') {
    return leaveHouseholdRaw(currentMember.id, replacementMemberId, taskStrategy, activityStrategy)
  }

  const [showAddChild, setShowAddChild] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [removingMember, setRemovingMember] = useState<FamilyMember | null>(null)
  const [leavingHousehold, setLeavingHousehold] = useState(false)
  const [restoringMemberId, setRestoringMemberId] = useState<string | null>(null)
  const [permanentlyDeletingMember, setPermanentlyDeletingMember] = useState<FamilyMember | null>(null)
  const [permanentDeleteBusy, setPermanentDeleteBusy] = useState(false)
  const [permanentDeleteError, setPermanentDeleteError] = useState<string | null>(null)
  const [permanentDeleteSuccess, setPermanentDeleteSuccess] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [memberActionError, setMemberActionError] = useState<string | null>(null)
  const [editingFamilyName, setEditingFamilyName] = useState(false)
  const [familyNameDraft, setFamilyNameDraft] = useState(familyName ?? '')
  const [familyNameSaving, setFamilyNameSaving] = useState(false)
  const [familyNameSaveError, setFamilyNameSaveError] = useState<string | null>(null)

  useEffect(() => {
    function updateOnlineState() { setIsOnline(typeof navigator === 'undefined' || navigator.onLine) }
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  async function handlePermanentDeleteMember() {
    if (!permanentlyDeletingMember) return
    setPermanentDeleteBusy(true)
    setPermanentDeleteError(null)
    try {
      await permanentlyDeleteRemovedMember(permanentlyDeletingMember.id)
      setPermanentDeleteSuccess(t.family.permanentDeleteSuccess(permanentlyDeletingMember.display_name))
      setPermanentlyDeletingMember(null)
      await Promise.all([refreshChores(), refreshActivities(), refreshOccurrenceAssignments()])
    } catch (error) {
      const message = error instanceof Error && /unsafe active references/i.test(error.message)
        ? t.family.permanentDeleteUnsafeReferences
        : t.family.permanentDeleteFailure
      setPermanentDeleteError(message)
    } finally {
      setPermanentDeleteBusy(false)
    }
  }

  async function handleFamilyNameSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!familyNameDraft.trim()) return
    setFamilyNameSaving(true)
    setFamilyNameSaveError(null)
    try {
      await updateFamilyName(familyNameDraft)
      setEditingFamilyName(false)
    } catch {
      setFamilyNameSaveError(t.family.errors.familyNameSaveFailed)
    } finally {
      setFamilyNameSaving(false)
    }
  }

  if (loading) {
    return <p className="loading">{t.loading.generic}</p>
  }

  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />
  }

  return (
    <>
      <ScreenHeader title={familyName ?? t.family.title}
        leading={<FamilyMark variant="dynamic" members={members} size={48} className="family-screen-mark" />}
        actions={<>
          {isParentOrAdmin && <AppToolbarAddButton onClick={() => setShowAddChild(true)}>{t.family.addChildAction}</AppToolbarAddButton>}
          {currentMember.role === 'admin' && !editingFamilyName && <button type="button" className="btn-secondary family-name-edit" onClick={() => {
              setFamilyNameDraft(familyName ?? '')
              setFamilyNameSaveError(null)
              setEditingFamilyName(true)
            }}>{t.family.editFamilyName}</button>}
        </>} />
        {editingFamilyName && (
          <form className="family-name-form" onSubmit={handleFamilyNameSubmit}>
            <label>
              {t.family.familyNameLabel}
              <input value={familyNameDraft} onChange={(event) => setFamilyNameDraft(event.target.value)} required disabled={familyNameSaving} />
            </label>
            <div className="modal-actions">
              <button type="submit" disabled={familyNameSaving || !familyNameDraft.trim()}>{familyNameSaving ? t.family.savingFamilyName : t.family.saveFamilyName}</button>
              <button type="button" className="btn-secondary" disabled={familyNameSaving} onClick={() => setEditingFamilyName(false)}>{t.common.close}</button>
            </div>
            {familyNameSaveError && <p className="error" role="alert">{familyNameSaveError}</p>}
          </form>
        )}

      <section className="page-section">
        <h2 className="section-heading">{t.family.membersTitle}</h2>
        <div className="panel is-primary">
          <ul className="section-list plain-list">
            {members.map((m) => (
              <li key={m.id} className="family-member-row">
                <MemberAvatar member={m} size={42} />
                <span className="family-member-copy">
                  <span className="row-title">{m.display_name}</span>
                  <span className="row-meta">{roleLabel(m.role)}</span>
                  {m.role !== 'child' && memberEmails.get(m.id) && (
                    // Only the login email of a genuinely linked account is shown;
                    // the no-account state is carried by the badge, so no empty
                    // email or misleading placeholder appears here.
                    <span className="family-member-email">{memberEmails.get(m.id)}</span>
                  )}
                </span>
                <span className="row-spacer" />
                <MemberAccountBadge member={m} account={childAccounts.get(m.id) ?? null} />
                {canEditMemberProfile(currentMember, m) && (
                  <button
                    type="button"
                    className="btn-secondary member-edit-button"
                    onClick={() => setEditingMember(m)}
                    aria-label={`${t.family.editProfile}: ${m.display_name}`}
                  >
                    {t.family.editProfile}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {isParentOrAdmin && allMembers.some((candidate) => candidate.status === 'removed') && <section className="page-section">
        <h2 className="section-heading">{t.family.removedMembersTitle}</h2>
        {memberActionError && <p className="error" role="alert">{memberActionError}</p>}
        {permanentDeleteSuccess && <p className="more-setting-feedback" role="status">{permanentDeleteSuccess}</p>}
        <div className="panel is-primary">
          <ul className="section-list plain-list">
            {allMembers.filter((candidate) => candidate.status === 'removed').map((archived) => <li key={archived.id}>
              <MemberAvatar member={archived} size={42} />
              <span className="row-title">{archived.display_name}</span>
              <ArchivedItemBadge>{t.family.removedMemberBadge}</ArchivedItemBadge>
              <span className="row-spacer" />
              <button type="button" className="btn-secondary" disabled={restoringMemberId === archived.id} onClick={async () => {
                setRestoringMemberId(archived.id)
                setMemberActionError(null)
                setPermanentDeleteSuccess(null)
                try { await handleRestoreMember(archived.id) } catch { setMemberActionError(t.family.restoreError) } finally { setRestoringMemberId(null) }
              }}>{restoringMemberId === archived.id ? t.family.restoringMember : t.family.restoreMemberAction}</button>
              <DestructiveIconButton
                label={isOnline ? t.family.permanentDeleteAction : t.family.permanentDeleteOffline}
                title={isOnline ? t.family.permanentDeleteAction : t.family.permanentDeleteOffline}
                disabled={!isOnline || permanentDeleteBusy}
                onClick={() => {
                  setPermanentDeleteError(null)
                  setPermanentDeleteSuccess(null)
                  setPermanentlyDeletingMember(archived)
                }}
              />
            </li>)}
          </ul>
        </div>
      </section>}

      {isParentOrAdmin && (
        <section className="page-section">
          <div className="family-actions">
            <button className="btn-secondary" onClick={() => setShowInvite(true)}>
              {t.family.inviteParentAction}
            </button>
          </div>
        </section>
      )}

      {showAddChild && (
        <Modal title={t.chores.addChildTitle} onClose={() => setShowAddChild(false)}>
          <AddChildForm
            onSubmit={async (displayName, avatarFile) => {
              await addChild(displayName, avatarFile)
              setShowAddChild(false)
            }}
          />
        </Modal>
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} createInvite={createInvite} />}

      {editingMember && (
        <MemberProfileModal
          key={editingMember.id}
          member={editingMember}
          currentMember={currentMember}
          refreshMembers={refreshMembers}
          childAccount={childAccounts.get(editingMember.id) ?? null}
          accountEmail={memberEmails.get(editingMember.id) ?? null}
          onAccountChanged={async () => { await Promise.all([refreshMembers(), refreshChildAccounts()]) }}
          onRequestRemove={isParentOrAdmin && editingMember.id !== currentMember.id ? () => {
            setRemovingMember(editingMember)
            setEditingMember(null)
          } : undefined}
          onRequestLeave={isParentOrAdmin && editingMember.id === currentMember.id ? () => {
            setLeavingHousehold(true)
            setEditingMember(null)
          } : undefined}
          onClose={() => setEditingMember(null)}
        />
      )}

      {removingMember && <MemberRemovalDialog
        member={removingMember}
        activeMembers={members}
        chores={chores}
        activities={activities}
        onConfirm={(replacementMemberId, taskStrategy, activityStrategy) => handleRemoveMember(removingMember.id, replacementMemberId, taskStrategy, activityStrategy)}
        onClose={() => setRemovingMember(null)}
      />}
      <ConfirmDestructiveActionDialog
        open={Boolean(permanentlyDeletingMember)}
        title={permanentlyDeletingMember ? t.family.permanentDeleteConfirmTitle(permanentlyDeletingMember.display_name) : ''}
        explanation={t.family.permanentDeleteConfirmDescription}
        confirmLabel={t.family.permanentDeleteConfirmAction}
        busy={permanentDeleteBusy}
        error={permanentDeleteError}
        onCancel={() => { if (!permanentDeleteBusy) setPermanentlyDeletingMember(null) }}
        onConfirm={handlePermanentDeleteMember}
      />
      {leavingHousehold && <MemberRemovalDialog
        member={currentMember}
        activeMembers={members}
        chores={chores}
        activities={activities}
        selfLeave
        onConfirm={leaveHousehold}
        onClose={() => setLeavingHousehold(false)}
      />}
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
    } catch {
      setError(t.errors.generic)
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

      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  )
}
