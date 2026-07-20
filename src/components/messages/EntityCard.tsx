import { useCallback, useState } from 'react'
import { t } from '../../strings'
import { useRouterActions } from '../../router'
import { useChoresData } from '../../context/chores/ChoresContext'
import { useShopping } from '../../context/shopping/ShoppingContext'
import { useActivitiesData } from '../../context/activities/ActivitiesContext'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { memberColorStyle } from '../../utils/memberColor'
import type { MessageEntityResolution } from '../../context/messages/types'

interface Props {
  resolution: MessageEntityResolution
  conversationId: string
  // Re-resolve this card after an action changed the underlying entity.
  onAfterAction: () => void
  // Post a restrained system notice after a completing action.
  onSystemNotice: (kind: string, summary: string) => void
}

// A live card for a shared planner entity. It prefers the entity's CURRENT
// state from the owning module context (so it updates in real time via that
// context's own subscription), and falls back to the resolver snapshot when
// the entity is outside the loaded window. Actions reuse the existing module
// mutations — no completion logic is duplicated here.
export function EntityCard({ resolution, conversationId, onAfterAction, onSystemNotice }: Props) {
  switch (resolution.entityType) {
    case 'task':
      return <TaskCard resolution={resolution} conversationId={conversationId} onAfterAction={onAfterAction} onSystemNotice={onSystemNotice} />
    case 'shopping_item':
      return <ShoppingCard resolution={resolution} conversationId={conversationId} onAfterAction={onAfterAction} onSystemNotice={onSystemNotice} />
    case 'event':
      return <EventCard resolution={resolution} />
    case 'reminder':
      return <ReminderCard resolution={resolution} />
    default:
      return null
  }
}

function CardShell({
  type, icon, title, children, deleted, actions,
}: {
  type: string
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
  deleted?: boolean
  actions?: React.ReactNode
}) {
  return (
    <div className={`messages-entity-card${deleted ? ' is-deleted' : ''}`} data-entity-type={type}>
      <div className="messages-entity-card-head">
        <span className="messages-entity-card-icon" aria-hidden="true">{icon}</span>
        <div className="messages-entity-card-headings">
          <span className="messages-entity-card-kind">{type}</span>
          <span className="messages-entity-card-title">{title}</span>
        </div>
      </div>
      {children && <div className="messages-entity-card-body">{children}</div>}
      {actions && <div className="messages-entity-card-actions">{actions}</div>}
    </div>
  )
}

function useMemberName() {
  const { memberName } = useFamilyMembersData()
  return memberName
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// ------------------------------------------------------------ Task

function TaskCard({ resolution, onAfterAction, onSystemNotice }: Props) {
  const { navigate } = useRouterActions()
  const { currentMember, isParentOrAdmin } = useFamilyCore()
  const memberName = useMemberName()
  const { members } = useFamilyMembersData()
  const chores = useChoresData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const live = chores.chores.find((c) => c.id === resolution.entityId)
  const s = resolution.state
  const title = live?.title ?? str(s.title) ?? resolution.state.fallback_label as string ?? ''
  const assignedTo = live?.assigned_to ?? (str(s.assigned_to) as string | null)
  const rewardEnabled = live?.reward_enabled ?? Boolean(s.reward_enabled)
  const rewardAmount = live?.reward_amount ?? (typeof s.reward_amount === 'number' ? s.reward_amount : 0)
  const dueDate = live?.due_date ?? (str(s.due_date) as string | null)

  const latest = chores.latestCompletionFor(resolution.entityId)
  const completionStatus = latest?.status ?? (str(s.last_completion_status) as string | null)
  const done = completionStatus === 'approved'
  const pending = completionStatus === 'pending_approval'

  // Frontend gate (server RPC is the real authority): the assignee or a
  // parent/admin may complete. Children may complete their own task.
  const canComplete = !done && !pending && (isParentOrAdmin || assignedTo === currentMember.id)
  const assignee = assignedTo ? members.find((m) => m.id === assignedTo) : null

  const handleDone = useCallback(async () => {
    setBusy(true)
    setError(false)
    try {
      // Match the rest of the app (ChoreList / ChoreDetailModal): complete
      // by (choreId, assignedTo) and let the RPC resolve the current
      // occurrence. Passing an explicit occurrence date trips a latent
      // ambiguous-column bug in complete_household_task, and no other
      // caller does it.
      await chores.markDone(resolution.entityId, assignedTo ?? undefined)
      onSystemNotice('task_completed', t.messages.entityCard.systemTaskCompleted(memberName(currentMember.id), title))
      onAfterAction()
    } catch (e) {
      console.error('Failed to complete shared task:', e)
      setError(true)
    } finally {
      setBusy(false)
    }
  }, [chores, resolution.entityId, assignedTo, onSystemNotice, memberName, currentMember.id, title, onAfterAction])

  if (!resolution.exists) {
    return <CardShell type={t.messages.entityCard.typeTask} icon={<TaskIcon />} title={str(s.fallback_label) ?? title} deleted>
      <p className="messages-entity-card-deleted-note">{t.messages.entityCard.deleted}</p>
    </CardShell>
  }

  return (
    <CardShell
      type={t.messages.entityCard.typeTask}
      icon={<TaskIcon />}
      title={title}
      actions={
        <>
          {canComplete && (
            <button type="button" className="btn-primary messages-entity-card-primary" onClick={() => void handleDone()} disabled={busy}>
              {busy ? t.messages.entityCard.working : t.messages.entityCard.markDone}
            </button>
          )}
          <button type="button" className="btn-link messages-entity-card-open" onClick={() => navigate('/chores')}>
            {t.messages.entityCard.openTask}
          </button>
        </>
      }
    >
      <div className="messages-entity-card-meta">
        {assignee && (
          <span className="messages-entity-chip" style={memberColorStyle(assignee)}>
            {t.messages.entityCard.assignedTo(memberName(assignee.id))}
          </span>
        )}
        {dueDate && <span className="messages-entity-chip is-quiet">{formatDate(dueDate)}</span>}
        {rewardEnabled && rewardAmount > 0 && <span className="messages-entity-chip is-quiet">{rewardAmount} Kč</span>}
        {done && <span className="messages-entity-status is-done">{t.messages.entityCard.done}</span>}
        {pending && <span className="messages-entity-status is-pending">{t.messages.entityCard.pendingApproval}</span>}
      </div>
      {error && <p className="messages-entity-card-error" role="alert">{t.messages.entityCard.actionFailed}</p>}
    </CardShell>
  )
}

// ------------------------------------------------------------ Shopping

function ShoppingCard({ resolution, onAfterAction, onSystemNotice }: Props) {
  const { navigate } = useRouterActions()
  const { currentMember } = useFamilyCore()
  const memberName = useMemberName()
  const { members } = useFamilyMembersData()
  const shopping = useShopping()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const live = shopping.shoppingItems.find((i) => i.id === resolution.entityId)
  const s = resolution.state
  const name = live?.name ?? str(s.name) ?? (str(s.fallback_label) as string) ?? ''
  const quantity = live?.quantity ?? (typeof s.quantity === 'number' ? s.quantity : null)
  const unit = live?.unit ?? (str(s.unit) as string | null)
  const purchased = live?.purchased ?? Boolean(s.purchased)
  const responsibleId = live?.responsible_member_id ?? (str(s.responsible_member_id) as string | null)
  const responsible = responsibleId ? members.find((m) => m.id === responsibleId) : null

  const handleBought = useCallback(async () => {
    setBusy(true)
    setError(false)
    try {
      await shopping.toggleShoppingPurchased(resolution.entityId, true)
      onSystemNotice('item_purchased', t.messages.entityCard.systemItemPurchased(memberName(currentMember.id), name))
      onAfterAction()
    } catch (e) {
      console.error('Failed to mark shared item purchased:', e)
      setError(true)
    } finally {
      setBusy(false)
    }
  }, [shopping, resolution.entityId, onSystemNotice, memberName, currentMember.id, name, onAfterAction])

  if (!resolution.exists) {
    return <CardShell type={t.messages.entityCard.typeShopping} icon={<ShoppingIcon />} title={str(s.fallback_label) ?? name} deleted>
      <p className="messages-entity-card-deleted-note">{t.messages.entityCard.deleted}</p>
    </CardShell>
  }

  const amount = quantity ? `${quantity}${unit ? ` ${unit}` : ''}` : null

  return (
    <CardShell
      type={t.messages.entityCard.typeShopping}
      icon={<ShoppingIcon />}
      title={name}
      actions={
        <>
          {!purchased && (
            <button type="button" className="btn-primary messages-entity-card-primary" onClick={() => void handleBought()} disabled={busy}>
              {busy ? t.messages.entityCard.working : t.messages.entityCard.markBought}
            </button>
          )}
          <button type="button" className="btn-link messages-entity-card-open" onClick={() => navigate('/shopping')}>
            {t.messages.entityCard.openList}
          </button>
        </>
      }
    >
      <div className="messages-entity-card-meta">
        {amount && <span className="messages-entity-chip is-quiet">{amount}</span>}
        {responsible && (
          <span className="messages-entity-chip" style={memberColorStyle(responsible)}>
            {t.messages.entityCard.responsible(memberName(responsible.id))}
          </span>
        )}
        <span className={`messages-entity-status ${purchased ? 'is-done' : 'is-open'}`}>
          {purchased ? t.messages.entityCard.bought : t.messages.entityCard.toBuy}
        </span>
      </div>
      {error && <p className="messages-entity-card-error" role="alert">{t.messages.entityCard.actionFailed}</p>}
    </CardShell>
  )
}

// ------------------------------------------------------------ Event

function EventCard({ resolution }: { resolution: MessageEntityResolution }) {
  const { navigate } = useRouterActions()
  const activities = useActivitiesData()
  const s = resolution.state
  const live = activities.activities.find((a) => a.id === resolution.entityId)
  const title = live?.title ?? str(s.title) ?? (str(s.fallback_label) as string) ?? ''
  const startDate = live?.start_date ?? (str(s.start_date) as string | null)
  const startTime = live?.start_time ?? (str(s.start_time) as string | null)
  const location = live?.location ?? (str(s.location) as string | null)

  if (!resolution.exists) {
    return <CardShell type={t.messages.entityCard.typeEvent} icon={<EventIcon />} title={str(s.fallback_label) ?? title} deleted>
      <p className="messages-entity-card-deleted-note">{t.messages.entityCard.deleted}</p>
    </CardShell>
  }

  const when = startDate ? `${formatDate(startDate)}${startTime ? ` · ${startTime.slice(0, 5)}` : ''}` : null

  return (
    <CardShell
      type={t.messages.entityCard.typeEvent}
      icon={<EventIcon />}
      title={title}
      actions={
        <button type="button" className="btn-link messages-entity-card-open" onClick={() => navigate('/calendar')}>
          {t.messages.entityCard.openEvent}
        </button>
      }
    >
      <div className="messages-entity-card-meta">
        {when && <span className="messages-entity-chip is-quiet">{when}</span>}
        {location && <span className="messages-entity-chip is-quiet">{location}</span>}
      </div>
    </CardShell>
  )
}

// ------------------------------------------------------------ Reminder

function ReminderCard({ resolution }: { resolution: MessageEntityResolution }) {
  const { navigate } = useRouterActions()
  const s = resolution.state
  const restricted = Boolean(s.restricted)
  const title = str(s.title) ?? (str(s.fallback_label) as string) ?? ''
  const eventAt = str(s.event_at)

  if (!resolution.exists) {
    return <CardShell type={t.messages.entityCard.typeReminder} icon={<ReminderIcon />} title={str(s.fallback_label) ?? title} deleted>
      <p className="messages-entity-card-deleted-note">{t.messages.entityCard.deleted}</p>
    </CardShell>
  }

  return (
    <CardShell
      type={t.messages.entityCard.typeReminder}
      icon={<ReminderIcon />}
      title={title}
      actions={
        <button type="button" className="btn-link messages-entity-card-open" onClick={() => navigate('/reminders')}>
          {t.messages.entityCard.openReminder}
        </button>
      }
    >
      {restricted ? (
        <p className="messages-entity-card-deleted-note">{t.messages.entityCard.restricted}</p>
      ) : (
        <div className="messages-entity-card-meta">
          {eventAt && <span className="messages-entity-chip is-quiet">{formatDate(eventAt)}</span>}
        </div>
      )}
    </CardShell>
  )
}

// ------------------------------------------------------------ helpers

function formatDate(value: string): string {
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })
}

function TaskIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ShoppingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6h15l-1.5 9h-12z" strokeLinejoin="round" />
      <path d="M6 6 5 3H3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" />
    </svg>
  )
}
function EventIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  )
}
function ReminderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M9 2 5 5M15 2l4 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
