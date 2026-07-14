import { compareISODates } from '../utils/dueDate'
import { todayInTimeZone, type NotificationPreferences, type ReminderRecord } from './reminders'

export type ReminderSection = 'overdue' | 'today' | 'upcoming' | 'earlier'

export function activeReminders(reminders: ReminderRecord[]) {
  return reminders.filter((item) => !item.resolvedAt && !item.dismissedAt)
}

export function historyReminders(reminders: ReminderRecord[]) {
  return reminders.filter((item) => item.readAt || item.resolvedAt || item.dismissedAt)
}

export function unreadCount(reminders: ReminderRecord[]) {
  return activeReminders(reminders).filter((item) => !item.readAt).length
}

export function unreadActiveIds(reminders: ReminderRecord[]) {
  return activeReminders(reminders).filter((item) => !item.readAt).map((item) => item.id)
}

export function reminderSection(reminder: ReminderRecord, now: Date, timezone: string): ReminderSection {
  const today = todayInTimeZone(now, timezone)
  if (reminder.metadata.overdue || (reminder.eventAt && compareISODates(reminder.eventAt.slice(0, 10), today) < 0)) return 'overdue'
  if (reminder.eventAt?.slice(0, 10) === today) return 'today'
  if (reminder.eventAt) return 'upcoming'
  return 'earlier'
}

export interface ReminderDigest {
  kind: 'daily' | 'weekly'
  items: ReminderRecord[]
  important: number
  normal: number
  quiet: number
}

export function buildDigest(reminders: ReminderRecord[], kind: ReminderDigest['kind'], now: Date, timezone: string): ReminderDigest {
  const today = todayInTimeZone(now, timezone)
  const horizon = kind === 'daily' ? 1 : 7
  const items = activeReminders(reminders).filter((item) => {
    if (!item.eventAt || item.metadata.overdue) return true
    const eventDate = item.eventAt.slice(0, 10)
    const delta = (Date.parse(`${eventDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000
    return delta <= horizon
  })
  return {
    kind,
    items,
    important: items.filter((item) => item.importance === 'important').length,
    normal: items.filter((item) => item.importance === 'normal').length,
    quiet: items.filter((item) => item.importance === 'quiet').length,
  }
}

export function remindersEligibleForPush(reminders: ReminderRecord[], preferences: NotificationPreferences) {
  if (!preferences.pushEnabled) return []
  return activeReminders(reminders).filter((item) => !item.readAt && (!preferences.quietPushEnabled || item.importance !== 'quiet'))
}

export function isWithinQuietHours(date: Date, preferences: NotificationPreferences) {
  if (!preferences.quietHoursEnabled) return false
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: preferences.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
  const { quietHoursStart: start, quietHoursEnd: end } = preferences
  return start <= end ? time >= start && time < end : time >= start || time < end
}
