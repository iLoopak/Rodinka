import { useCallback, useMemo, useState } from 'react'
import { t } from '../../strings'
import { Modal } from '../ui/Modal'
import { useChoresData } from '../../context/chores/ChoresContext'
import { useShopping } from '../../context/shopping/ShoppingContext'
import { useActivitiesData } from '../../context/activities/ActivitiesContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useMessagesData } from '../../context/messages/MessagesContext'
import type { SharedEntityType } from '../../context/messages/types'
import { formatEntityPickerDate } from '../../utils/entityPicker'

export type ShareableEntityKind = Extract<SharedEntityType, 'task' | 'shopping_item' | 'event'>

interface Props {
  kind: ShareableEntityKind
  conversationId: string
  onClose: () => void
}

/** One row in the picker, normalised across the three source modules. */
interface PickerOption {
  id: string
  title: string
  /** Status / due date / time — the one line under the title. */
  meta: string[]
}

// "Share an existing record into this conversation."
//
// This is deliberately NOT a creation flow: nothing here inserts a chore,
// a shopping item or an activity. The chosen record is passed to the same
// `share_entity_to_conversation` RPC that the per-module "Sdílet do zpráv"
// button already uses, so the message stores a live reference (type + id)
// rather than a text snapshot, and the family/access check stays server-side.
//
// Options come from the modules' existing contexts rather than a fresh
// query, so the picker inherits their loading, error and realtime state and
// cannot show a record the user is not already allowed to see.
export function ShareExistingEntityDialog({ kind, conversationId, onClose }: Props) {
  const { chores, choresLoading, choresError } = useChoresData()
  const { shoppingItems, shoppingLoading, shoppingError } = useShopping()
  const { activities, activitiesLoading, activitiesError } = useActivitiesData()
  const { memberName } = useFamilyMembersData()
  const { shareEntity } = useMessagesData()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const loading = kind === 'task' ? choresLoading : kind === 'shopping_item' ? shoppingLoading : activitiesLoading
  const sourceError = kind === 'task' ? choresError : kind === 'shopping_item' ? shoppingError : activitiesError

  const options = useMemo<PickerOption[]>(() => {
    if (kind === 'task') {
      return chores
        // Archived/finished chores are not useful to share and would only
        // pad the list; the module's own screens hide them too.
        .filter((chore) => chore.status !== 'archived')
        .map((chore) => ({
          id: chore.id,
          title: chore.title,
          meta: [
            chore.assigned_to ? memberName(chore.assigned_to) : t.messages.entityPicker.unassigned,
            chore.due_date ? formatEntityPickerDate(chore.due_date) : '',
          ].filter(Boolean),
        }))
    }
    if (kind === 'shopping_item') {
      return shoppingItems
        .filter((item) => !item.archived_at && !item.purchased)
        .map((item) => ({
          id: item.id,
          title: item.name,
          meta: [
            item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : '',
            item.responsible_member_id ? memberName(item.responsible_member_id) : '',
          ].filter(Boolean),
        }))
    }
    return activities.map((activity) => ({
      id: activity.id,
      title: activity.title,
      meta: [
        formatEntityPickerDate(activity.start_date),
        activity.all_day
          ? t.messages.entityPicker.allDay
          : activity.start_time
            ? activity.start_time.slice(0, 5)
            : '',
        activity.responsible_member_id ? memberName(activity.responsible_member_id) : '',
      ].filter(Boolean),
    }))
  }, [kind, chores, shoppingItems, activities, memberName])

  const submit = useCallback(async () => {
    const chosen = options.find((option) => option.id === selectedId)
    if (!chosen || busy) return
    setBusy(true)
    setFailed(false)
    try {
      await shareEntity(conversationId, {
        entityType: kind,
        entityId: chosen.id,
        // Snapshot of the title only, used purely as the card's fallback if
        // the record is deleted later. Live state still comes from the
        // entity itself on every render.
        fallbackLabel: chosen.title,
      })
      onClose()
    } catch (e) {
      console.error('Failed to share existing entity to chat:', e)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [options, selectedId, busy, shareEntity, conversationId, kind, onClose])

  const copy = t.messages.entityPicker[kind]

  return (
    <Modal title={copy.title} onClose={onClose} className="messages-entity-picker-sheet">
      <p className="messages-share-body">{copy.body}</p>

      {loading && <p className="row-meta" role="status">{t.messages.entityPicker.loading}</p>}

      {!loading && sourceError && (
        <p className="messages-share-error" role="alert">{t.messages.entityPicker.loadFailed}</p>
      )}

      {!loading && !sourceError && options.length === 0 && (
        <p className="info-note">{copy.empty}</p>
      )}

      {!loading && !sourceError && options.length > 0 && (
        <ul className="messages-entity-picker-list">
          {options.map((option) => {
            const isSelected = option.id === selectedId
            return (
              <li key={option.id}>
                <label className={`messages-entity-picker-option${isSelected ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="entity-picker"
                    checked={isSelected}
                    onChange={() => setSelectedId(option.id)}
                  />
                  <span className="messages-entity-picker-text">
                    <strong>{option.title}</strong>
                    {option.meta.length > 0 && (
                      <small>{option.meta.join(' · ')}</small>
                    )}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {failed && <p className="messages-share-error" role="alert">{t.messages.entityPicker.shareFailed}</p>}

      <div className="family-actions">
        <button type="button" onClick={() => void submit()} disabled={!selectedId || busy}>
          {busy ? t.messages.shareDialog.sharing : t.messages.entityPicker.submit}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
          {t.common.close}
        </button>
      </div>
    </Modal>
  )
}
