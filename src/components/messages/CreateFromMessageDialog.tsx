import { useCallback, useState } from 'react'
import { t } from '../../strings'
import { Modal } from '../ui/Modal'
import { AddChoreForm } from '../AddChoreForm'
import { AddActivityForm } from '../AddActivityForm'
import { ShoppingItemForm } from '../shopping/ShoppingItemForm'
import { useChoresData } from '../../context/chores/ChoresContext'
import { useShopping } from '../../context/shopping/ShoppingContext'
import { useActivitiesData } from '../../context/activities/ActivitiesContext'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useFamilySettings } from '../../context/family/FamilySettingsContext'
import { useMessagesContent } from '../../context/messages/MessagesContentContext'
import type { SharedEntityType } from '../../context/messages/types'

export type CreateFromMessageKind = 'task' | 'shopping_item' | 'event'

interface Props {
  kind: CreateFromMessageKind
  /** Message text used to prefill the new entity's title/name. */
  sourceText: string
  conversationId: string
  onClose: () => void
}

// "Create task / Add to shopping / Create event" from a chat message.
//
// Deliberately renders the SAME form components the owning modules use
// (AddChoreForm, ShoppingItemForm, AddActivityForm) with a title
// prefilled from the message — no parallel simplified form, and no
// duplicated validation. Creation goes through each module's existing
// mutation, so business rules stay in one place.
export function CreateFromMessageDialog({ kind, sourceText, conversationId, onClose }: Props) {
  const { currentMember } = useFamilyCore()
  const { members } = useFamilyMembersData()
  const { shoppingCategorySettings } = useFamilySettings()
  const chores = useChoresData()
  const shopping = useShopping()
  const activities = useActivitiesData()
  const { shareEntity } = useMessagesContent()

  const [created, setCreated] = useState<{ type: SharedEntityType; id: string; label: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [sharing, setSharing] = useState(false)

  const kids = members.filter((m) => m.role === 'child')

  const title = kind === 'task'
    ? t.messages.createFromMessage.taskTitle
    : kind === 'shopping_item'
      ? t.messages.createFromMessage.shoppingTitle
      : t.messages.createFromMessage.eventTitle

  const shareBack = useCallback(async () => {
    if (!created) return
    setSharing(true)
    try {
      await shareEntity(conversationId, {
        entityType: created.type,
        entityId: created.id,
        fallbackLabel: created.label,
      })
      onClose()
    } catch (e) {
      console.error('Failed to share created entity back to chat:', e)
      setFailed(true)
    } finally {
      setSharing(false)
    }
  }, [created, shareEntity, conversationId, onClose])

  // After a successful create, offer to push the new entity back into the
  // conversation as a live card. Skipping is a first-class choice — the
  // entity already exists either way.
  if (created) {
    return (
      <Modal title={title} onClose={onClose}>
        <p className="info-note">{t.messages.createFromMessage.created}</p>
        <p>{t.messages.createFromMessage.shareBackPrompt}</p>
        {failed && <p className="messages-share-error" role="alert">{t.messages.createFromMessage.failed}</p>}
        <div className="family-actions">
          <button type="button" onClick={() => void shareBack()} disabled={sharing}>
            {sharing ? t.messages.shareDialog.sharing : t.messages.createFromMessage.shareBack}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={sharing}>
            {t.messages.createFromMessage.skip}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onClose}>
      {failed && <p className="messages-share-error" role="alert">{t.messages.createFromMessage.failed}</p>}

      {kind === 'task' && (
        <AddChoreForm
          members={members}
          currentMemberId={currentMember.id}
          initialTitle={sourceText}
          onSubmit={async (input) => {
            setFailed(false)
            try {
              await chores.addChore(input)
              // addChore doesn't return the new row; find it by title from
              // the refreshed list so we can offer to share it back.
              const match = [...chores.chores].reverse().find((c) => c.title === input.title)
              if (match) setCreated({ type: 'task', id: match.id, label: match.title })
              else onClose()
            } catch (e) {
              console.error('Failed to create task from message:', e)
              setFailed(true)
            }
          }}
        />
      )}

      {kind === 'shopping_item' && (
        <ShoppingItemForm
          initialName={sourceText}
          members={members}
          categorySettings={shoppingCategorySettings}
          onSubmit={async (input) => {
            setFailed(false)
            try {
              await shopping.addShoppingItem(input)
              const match = [...shopping.shoppingItems].reverse().find((i) => i.name === input.name)
              if (match) setCreated({ type: 'shopping_item', id: match.id, label: match.name })
              else onClose()
            } catch (e) {
              console.error('Failed to add shopping item from message:', e)
              setFailed(true)
            }
          }}
        />
      )}

      {kind === 'event' && (
        <AddActivityForm
          members={members}
          kids={kids}
          initialTitle={sourceText}
          onSubmit={async (input) => {
            setFailed(false)
            try {
              await activities.addActivity(input)
              const match = [...activities.activities].reverse().find((a) => a.title === input.title)
              if (match) setCreated({ type: 'event', id: match.id, label: match.title })
              else onClose()
            } catch (e) {
              console.error('Failed to create event from message:', e)
              setFailed(true)
            }
          }}
        />
      )}
    </Modal>
  )
}
