import { Link } from '../../router'
import { useReminderSummary } from '../../context/ReminderContext'
import { t } from '../../strings'

export function ReminderBell() {
  const { unreadCount, hasImportantUnread } = useReminderSummary()
  return <ReminderBellView unreadCount={unreadCount} hasImportantUnread={hasImportantUnread} />
}

export function compactReminderCount(count: number) {
  return count > 9 ? '9+' : String(count)
}

export function ReminderBellView({ unreadCount, hasImportantUnread }: { unreadCount: number; hasImportantUnread: boolean }) {
  const label = unreadCount === 0 ? t.reminders.bellLabel : t.reminders.bellUnread(unreadCount)
  return <Link to="/reminders" className={`reminder-bell${hasImportantUnread ? ' important' : ''}${unreadCount > 0 ? ' has-unread' : ''}`} aria-label={label}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    {unreadCount > 0 && <span className="reminder-badge" aria-hidden="true">{compactReminderCount(unreadCount)}</span>}
  </Link>
}
