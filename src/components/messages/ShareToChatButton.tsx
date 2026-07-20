import { useCallback, useMemo, useState } from 'react'
import { t } from '../../strings'
import { Modal } from '../ui/Modal'
import { MemberAvatar } from '../ui/MemberAvatar'
import { useMessagesActions, useMessagesSummary } from '../../context/messages/MessagesSummaryContext'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { isActiveFamilyMember } from '../../hooks/useFamilyMembers'
import type { SharedEntityType } from '../../context/messages/types'

interface Props {
  entityType: SharedEntityType
  entityId: string
  /** Current title/name — stored as the card's fallback if the entity is later deleted. */
  label: string
  className?: string
}

// "Sdílet do zpráv" — the single entry point every module uses to push a
// live entity card into a conversation. Deliberately one shared component
// (not a per-module reimplementation) so the target picker, the optional
// note, and the error handling stay identical everywhere.
export function ShareToChatButton({ entityType, entityId, label, className }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={className ?? 'btn-secondary'}
        onClick={() => setOpen(true)}
      >
        {t.messages.entityCard.shareToChat}
      </button>
      {open && (
        <ShareToChatDialog
          entityType={entityType}
          entityId={entityId}
          label={label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

interface DialogProps extends Omit<Props, 'className'> {
  onClose: () => void
}

type Target =
  | { kind: 'group'; conversationId: string }
  | { kind: 'direct'; memberId: string; conversationId: string | null }

function ShareToChatDialog({ entityType, entityId, label, onClose }: DialogProps) {
  const { currentMember } = useFamilyCore()
  const { members, memberName } = useFamilyMembersData()
  // Reads the summary only: this button lives on Shopping, chore and activity
  // screens, so it must never be a reason to load chat content. The optimistic
  // bubble belongs to the Messages route, which is not on screen here anyway.
  const { groupConversation, directConversationsByMember } = useMessagesSummary()
  const { ensureGroupConversation, ensureDirectConversation, shareEntity } = useMessagesActions()
  const [selected, setSelected] = useState<Target | null>(
    groupConversation ? { kind: 'group', conversationId: groupConversation.id } : null,
  )
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // Only active members, never self — a self-DM has no entry point.
  const directTargets = useMemo(
    () => members.filter((m) => m.id !== currentMember.id && isActiveFamilyMember(m)),
    [members, currentMember.id],
  )

  const submit = useCallback(async () => {
    if (!selected || busy) return
    setBusy(true)
    setFailed(false)
    try {
      // Resolve the conversation lazily: a direct thread may not exist yet,
      // and the group thread is self-healing. Both go through the same
      // security-definer RPCs the messaging module already uses, so no
      // duplicate conversation can be created.
      let conversationId: string
      if (selected.kind === 'group') {
        conversationId = selected.conversationId || (await ensureGroupConversation())
      } else {
        conversationId = selected.conversationId ?? (await ensureDirectConversation({ id: selected.memberId, memberId: selected.memberId }))
      }
      await shareEntity(conversationId, {
        entityType,
        entityId,
        body: note.trim() || undefined,
        fallbackLabel: label,
      })
      onClose()
    } catch (e) {
      console.error('Failed to share entity to chat:', e)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [selected, busy, ensureGroupConversation, ensureDirectConversation, shareEntity, entityType, entityId, note, label, onClose])

  const hasTargets = Boolean(groupConversation) || directTargets.length > 0

  return (
    <Modal title={t.messages.shareDialog.title} onClose={onClose} className="messages-share-sheet">
      <p className="messages-share-body">{t.messages.shareDialog.body}</p>

      {!hasTargets && <p className="info-note">{t.messages.shareDialog.noTargets}</p>}

      <ul className="messages-share-targets">
        {groupConversation && (
          <li>
            <label className={`messages-share-target${selected?.kind === 'group' ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="share-target"
                checked={selected?.kind === 'group'}
                onChange={() => setSelected({ kind: 'group', conversationId: groupConversation.id })}
              />
              <span className="messages-share-target-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="9" r="3" strokeLinejoin="round" />
                  <circle cx="17" cy="10.5" r="2.4" strokeLinejoin="round" />
                  <path d="M3.5 19c0-2.6 2.4-4.5 5.5-4.5s5.5 1.9 5.5 4.5" strokeLinecap="round" />
                  <path d="M15 15c2.6 0 4.6 1.7 4.6 4.2" strokeLinecap="round" />
                </svg>
              </span>
              <span>{t.messages.shareDialog.wholeFamily}</span>
            </label>
          </li>
        )}
        {directTargets.map((member) => {
          const existing = directConversationsByMember.get(member.id)
          const isSelected = selected?.kind === 'direct' && selected.memberId === member.id
          return (
            <li key={member.id}>
              <label className={`messages-share-target${isSelected ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="share-target"
                  checked={isSelected}
                  onChange={() => setSelected({ kind: 'direct', memberId: member.id, conversationId: existing?.id ?? null })}
                />
                <MemberAvatar member={member} size={28} />
                <span>{memberName(member.id)}</span>
              </label>
            </li>
          )
        })}
      </ul>

      <label className="messages-share-note">
        <span>{t.messages.shareDialog.noteLabel}</span>
        <textarea
          value={note}
          rows={2}
          placeholder={t.messages.shareDialog.notePlaceholder}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {failed && <p className="messages-share-error" role="alert">{t.messages.shareDialog.failed}</p>}

      <div className="family-actions">
        <button type="button" onClick={() => void submit()} disabled={!selected || busy}>
          {busy ? t.messages.shareDialog.sharing : t.messages.shareDialog.submit}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
          {t.common.close}
        </button>
      </div>
    </Modal>
  )
}
