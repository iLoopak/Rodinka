import { getCurrentLanguage } from '../../../i18n'
import {
  DEFAULT_CATEGORY_PREFERENCES,
  browserTimezone,
  defaultNotificationPreferences,
  isValidTimeZone,
  reminderStatus,
  type NotificationPreferences,
  type ReminderCategory,
  type ReminderRecord,
} from '../../../notifications/reminders'

type Row = Record<string, unknown>

/**
 * Explicit column lists. The reminders read used to request every column,
 * which meant anything later added to the table silently joined the payload —
 * including columns the client has no business holding.
 */
export const REMINDER_COLUMNS =
  'id, family_id, target_member_id, dedupe_key, source, reminder_type, title, description, importance, event_at, generated_at, expires_at, deep_link, grouping_key, metadata, read_at, dismissed_at, resolved_at, last_seen_at'

/**
 * What the header bell needs: enough to compute status and unread importance,
 * and nothing else. No title, description, metadata or deep link — the bell
 * renders two numbers and used to pull the entire list to get them.
 */
export const REMINDER_SUMMARY_COLUMNS = 'id, importance, read_at, dismissed_at, resolved_at'

export const NOTIFICATION_PREFERENCE_COLUMNS =
  'member_id, family_id, in_app_enabled, push_enabled, daily_digest_enabled, weekly_digest_enabled, quiet_push_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, timezone_mode, locale, category_preferences, message_direct_enabled, message_group_enabled, message_reply_mention_enabled, message_task_enabled, message_entity_enabled, message_sound_enabled, message_preview_enabled'

export function mapReminder(row: Row): ReminderRecord {
  const base = {
    id: String(row.id),
    familyId: String(row.family_id),
    targetMemberId: String(row.target_member_id),
    dedupeKey: String(row.dedupe_key),
    source: String(row.source) as ReminderRecord['source'],
    type: String(row.reminder_type),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    importance: String(row.importance) as ReminderRecord['importance'],
    eventAt: row.event_at ? String(row.event_at) : null,
    generatedAt: String(row.generated_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    deepLink: row.deep_link ? String(row.deep_link) : null,
    groupingKey: row.grouping_key ? String(row.grouping_key) : null,
    metadata: (row.metadata ?? { sourceIds: [] }) as ReminderRecord['metadata'],
    readAt: row.read_at ? String(row.read_at) : null,
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    lastSeenAt: String(row.last_seen_at),
  }
  return { ...base, status: reminderStatus(base) }
}

/**
 * The subset the summary query returns. It carries exactly the three
 * timestamps `activeReminders` and `unreadCount` look at, so the bell applies
 * the same rule as the Center rather than a second approximation of it.
 */
export interface ReminderSummaryRow {
  id: string
  importance: ReminderRecord['importance']
  readAt: string | null
  dismissedAt: string | null
  resolvedAt: string | null
}

export function mapReminderSummaryRow(row: Row): ReminderSummaryRow {
  return {
    id: String(row.id),
    importance: String(row.importance) as ReminderRecord['importance'],
    readAt: row.read_at ? String(row.read_at) : null,
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  }
}

export function mapPreferences(row: Row | null, memberId: string, familyId: string): NotificationPreferences {
  const defaults = defaultNotificationPreferences(memberId, familyId, browserTimezone(), getCurrentLanguage())
  if (!row) return defaults
  const dailyDigestEnabled = Boolean(row.daily_digest_enabled)
  const storedTimezone = String(row.timezone ?? defaults.timezone)
  return {
    memberId,
    familyId,
    inAppEnabled: Boolean(row.in_app_enabled),
    pushEnabled: Boolean(row.push_enabled),
    dailyDigestEnabled,
    weeklyDigestEnabled: !dailyDigestEnabled && Boolean(row.weekly_digest_enabled),
    quietPushEnabled: Boolean(row.quiet_push_enabled),
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: String(row.quiet_hours_start ?? defaults.quietHoursStart).slice(0, 5),
    quietHoursEnd: String(row.quiet_hours_end ?? defaults.quietHoursEnd).slice(0, 5),
    timezone: isValidTimeZone(storedTimezone) ? storedTimezone : 'UTC',
    timezoneMode: row.timezone_mode === 'explicit' ? 'explicit' : 'auto',
    locale: row.locale === 'en' ? 'en' : 'cs',
    categories: { ...DEFAULT_CATEGORY_PREFERENCES, ...((row.category_preferences as Partial<Record<ReminderCategory, boolean>> | null) ?? {}) },
    // A row written before the batch 4 migration has these columns as SQL
    // defaults (true); `!== false` keeps a missing column reading as on.
    messages: {
      direct: row.message_direct_enabled !== false,
      group: row.message_group_enabled !== false,
      replyMention: row.message_reply_mention_enabled !== false,
      task: row.message_task_enabled !== false,
      entity: row.message_entity_enabled !== false,
      sound: row.message_sound_enabled !== false,
      preview: row.message_preview_enabled !== false,
    },
  }
}

export function preferencesToRow(preferences: NotificationPreferences) {
  return {
    member_id: preferences.memberId,
    family_id: preferences.familyId,
    in_app_enabled: preferences.inAppEnabled,
    push_enabled: preferences.pushEnabled,
    daily_digest_enabled: preferences.dailyDigestEnabled,
    weekly_digest_enabled: preferences.weeklyDigestEnabled,
    quiet_push_enabled: preferences.quietPushEnabled,
    quiet_hours_enabled: preferences.quietHoursEnabled,
    quiet_hours_start: preferences.quietHoursStart,
    quiet_hours_end: preferences.quietHoursEnd,
    timezone: preferences.timezone,
    timezone_mode: preferences.timezoneMode,
    locale: preferences.locale,
    category_preferences: preferences.categories,
    message_direct_enabled: preferences.messages.direct,
    message_group_enabled: preferences.messages.group,
    message_reply_mention_enabled: preferences.messages.replyMention,
    message_task_enabled: preferences.messages.task,
    message_entity_enabled: preferences.messages.entity,
    message_sound_enabled: preferences.messages.sound,
    message_preview_enabled: preferences.messages.preview,
  }
}
