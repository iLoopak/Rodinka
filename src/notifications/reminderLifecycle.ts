export const REMINDER_FOREGROUND_REFRESH_MS = 15 * 60 * 1000
export const REMINDER_BACKGROUND_REFRESH_MS = 2 * 60 * 1000
export const REMINDER_INVALIDATION_KEY = 'rodinka:reminders:invalidate'

export function shouldRefreshAfterBackground(hiddenAt: number | null, now: number, threshold = REMINDER_BACKGROUND_REFRESH_MS) {
  return hiddenAt !== null && now - hiddenAt >= threshold
}

// 'sources' (raw chore/activity/medical/... data changed) used to be a third
// kind here, broadcast so sibling tabs would know to recompute reminders.
// Now that every one of those domains has its own realtime subscription
// (see src/realtime/), each tab already gets pushed updates independently
// and recomputes reminders on its own — no cross-tab signal needed. 'state'
// (read/dismiss) and 'preferences' remain: reminders and
// notification_preferences aren't realtime-subscribed tables, so a change
// made in one tab still has no other way to reach a sibling tab.
export type ReminderInvalidationKind = 'state' | 'preferences'

export interface ReminderInvalidationMessage {
  kind: ReminderInvalidationKind
  familyId: string
  memberId: string
  senderId: string
  fingerprint?: string
  at: number
}

export function parseReminderInvalidation(value: string | null): ReminderInvalidationMessage | null {
  if (!value) return null
  try {
    const message = JSON.parse(value) as Partial<ReminderInvalidationMessage>
    if (!['state', 'preferences'].includes(message.kind ?? '')) return null
    if (!message.familyId || !message.memberId || !message.senderId || typeof message.at !== 'number') return null
    return message as ReminderInvalidationMessage
  } catch {
    return null
  }
}
