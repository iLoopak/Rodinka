import { Link } from '../../router'
import { useMessagesData } from '../../context/messages/MessagesContext'
import { t } from '../../strings'
import { compactReminderCount } from '../reminders/ReminderBell'

// Header entry point into the /messages route — mirrors ReminderBell so the
// two live conversations that families care about (reminders + chat) share
// the same visual language and don't clash with each other.
export function MessagesBell() {
  const { totalUnreadCount } = useMessagesData()
  const label = totalUnreadCount === 0
    ? t.messages.bellLabel
    : t.messages.bellUnread(totalUnreadCount)
  return (
    <Link to="/messages" className={`messages-bell${totalUnreadCount > 0 ? ' has-unread' : ''}`} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 3v-3H6a2 2 0 0 1-2-2Z" strokeLinejoin="round" />
      </svg>
      {totalUnreadCount > 0 && <span className="messages-badge" aria-hidden="true">{compactReminderCount(totalUnreadCount)}</span>}
    </Link>
  )
}
