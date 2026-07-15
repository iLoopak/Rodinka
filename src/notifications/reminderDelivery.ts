import { addDays } from '../utils/isoDate.ts'
import { isValidTimeZone, type NotificationPreferences, type ReminderDraft } from './reminders.ts'

export type DeliveryType = 'immediate' | 'daily_digest' | 'weekly_digest'
export type DeliveryChannel = 'planned'

export interface ReminderDeliveryState {
  readAt: string | null
  dismissedAt: string | null
  resolvedAt: string | null
  generatedAt?: string | null
  occurrenceKey?: string | null
}

export interface DeliveryDraft {
  idempotencyKey: string
  reminderDedupeKey: string | null
  deliveryType: DeliveryType
  channel: DeliveryChannel
  groupingKey: string | null
  title: string
  body: string | null
  deepLink: string | null
  importance: ReminderDraft['importance']
  scheduledFor: string
  metadata: Record<string, unknown>
}

export interface CreateDeliveryDraftsInput {
  familyId: string
  memberId: string
  now: Date
  preferences: NotificationPreferences
  reminders: ReminderDraft[]
  existingState?: Record<string, ReminderDeliveryState | undefined>
  locale?: 'cs' | 'en'
  dailyTime?: string
  weeklyWeekday?: number
  weeklyTime?: string
}

interface ZonedParts {
  date: string
  hour: number
  minute: number
}

function safeTimezone(timezone: string) {
  return isValidTimeZone(timezone) ? timezone : 'UTC'
}

export function zonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '0'
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')), minute: Number(value('minute')) }
}

export function zonedDateTimeToUtc(localDate: string, localTime: string, timezone: string): Date {
  const [year, month, day] = localDate.split('-').map(Number)
  const [hour, minute] = localTime.split(':').map(Number)
  const target = Date.UTC(year, month - 1, day, hour, minute)
  let guess = target
  for (let pass = 0; pass < 3; pass += 1) {
    const observed = zonedParts(new Date(guess), timezone)
    const [observedYear, observedMonth, observedDay] = observed.date.split('-').map(Number)
    const observedAsUtc = Date.UTC(observedYear, observedMonth - 1, observedDay, observed.hour, observed.minute)
    const adjustment = target - observedAsUtc
    guess += adjustment
    if (adjustment === 0) break
  }
  return new Date(guess)
}

function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export function isWithinQuietHoursAt(date: Date, preferences: NotificationPreferences) {
  if (!preferences.quietHoursEnabled) return false
  const local = zonedParts(date, preferences.timezone)
  const current = local.hour * 60 + local.minute
  const start = minutes(preferences.quietHoursStart)
  const end = minutes(preferences.quietHoursEnd)
  return start <= end ? current >= start && current < end : current >= start || current < end
}

export function deferPastQuietHours(date: Date, preferences: NotificationPreferences): Date {
  if (!isWithinQuietHoursAt(date, preferences)) return date
  const local = zonedParts(date, preferences.timezone)
  const current = local.hour * 60 + local.minute
  const start = minutes(preferences.quietHoursStart)
  const endDate = start > minutes(preferences.quietHoursEnd) && current >= start ? addDays(local.date, 1) : local.date
  return zonedDateTimeToUtc(endDate, preferences.quietHoursEnd, preferences.timezone)
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function deliveryOccurrenceIdentity(dedupeKey: string, metadata: ReminderDraft['metadata']) {
  const sourceIds = [...metadata.sourceIds].sort().join(',')
  const occurrences = Array.isArray(metadata.occurrences) ? [...metadata.occurrences].sort().join(',') : ''
  return stableHash(`${dedupeKey}|${sourceIds}|${occurrences}|${metadata.eventDate ?? ''}|${metadata.thresholdDays ?? ''}`)
}

export function deliveryOccurrenceKey(reminder: ReminderDraft) {
  return deliveryOccurrenceIdentity(reminder.dedupeKey, reminder.metadata)
}

function localWeekday(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function localIsoWeek(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const weekYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(weekYear, 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${weekYear}-W${String(week).padStart(2, '0')}`
}

function category(source: ReminderDraft['source']) {
  if (source === 'chore') return 'chores'
  if (source === 'activity' || source === 'activity-payment') return 'activities'
  if (source === 'medical-appointment' || source === 'vaccination') return 'medical'
  if (source === 'voting') return 'voting'
  if (source === 'meal-plan') return 'meals'
  if (source === 'allowance') return 'allowance'
  if (source === 'document') return 'documents'
  return 'shopping'
}

export function digestSummary(reminders: ReminderDraft[], locale: 'cs' | 'en' = 'cs') {
  const counts = new Map<string, number>()
  for (const reminder of reminders) counts.set(category(reminder.source), (counts.get(category(reminder.source)) ?? 0) + Number(reminder.metadata.count ?? 1))
  const labels = locale === 'en'
    ? { chores: 'chores', activities: 'activities', medical: 'health dates', voting: 'votes', meals: 'meal plans', allowance: 'approvals', documents: 'documents', shopping: 'shopping items' }
    : { chores: 'úkoly', activities: 'aktivity', medical: 'zdravotní termíny', voting: 'hlasování', meals: 'jídelní plány', allowance: 'schválení', documents: 'dokumenty', shopping: 'položky k nákupu' }
  return [...counts.entries()].map(([key, count]) => `${count} ${labels[key as keyof typeof labels]}`).join(', ')
}

function digestCandidates(reminders: ReminderDraft[], localDate: string, horizonDays: number) {
  const horizon = addDays(localDate, horizonDays)
  return reminders.filter((reminder) => {
    if (!reminder.eventAt || reminder.metadata.overdue) return true
    return reminder.eventAt.slice(0, 10) <= horizon
  })
}

export function createDeliveryDrafts(input: CreateDeliveryDraftsInput): DeliveryDraft[] {
  const preferences = { ...input.preferences, timezone: safeTimezone(input.preferences.timezone) }
  const state = input.existingState ?? {}
  const actionable = input.reminders.filter((reminder) => {
    const persisted = state[reminder.dedupeKey]
    return !persisted?.dismissedAt || Boolean(persisted.resolvedAt)
  })
  const deliveries: DeliveryDraft[] = []

  if (preferences.pushEnabled) {
    for (const reminder of actionable) {
      const persisted = state[reminder.dedupeKey]
      if (persisted?.readAt && !persisted.resolvedAt) continue
      if (reminder.importance === 'quiet' && preferences.quietPushEnabled) continue
      const occurrenceKey = deliveryOccurrenceKey(reminder)
      const unchangedOccurrence = persisted && !persisted.resolvedAt && persisted.occurrenceKey === occurrenceKey
      const generatedAt = persisted?.generatedAt ? Date.parse(persisted.generatedAt) : Number.NaN
      if (unchangedOccurrence && Number.isFinite(generatedAt) && input.now.getTime() - generatedAt > 30 * 60 * 1000) continue
      const scheduledFor = deferPastQuietHours(input.now, preferences)
      deliveries.push({
        idempotencyKey: `immediate:${input.memberId}:${reminder.dedupeKey}:${occurrenceKey}`,
        reminderDedupeKey: reminder.dedupeKey,
        deliveryType: 'immediate', channel: 'planned', groupingKey: reminder.groupingKey,
        title: reminder.title, body: reminder.description, deepLink: reminder.deepLink,
        importance: reminder.importance, scheduledFor: scheduledFor.toISOString(),
        metadata: { sourceIds: reminder.metadata.sourceIds, occurrence: occurrenceKey },
      })
    }
  }

  const local = zonedParts(input.now, preferences.timezone)
  const currentMinutes = local.hour * 60 + local.minute
  const locale = input.locale ?? 'cs'
  const dailyTime = input.dailyTime ?? '08:00'
  const dailyItems = digestCandidates(actionable, local.date, 1)
  if (preferences.dailyDigestEnabled && currentMinutes >= minutes(dailyTime) && dailyItems.length > 0) {
    const desired = zonedDateTimeToUtc(local.date, dailyTime, preferences.timezone)
    const scheduledFor = deferPastQuietHours(desired > input.now ? desired : input.now, preferences)
    deliveries.push({
      idempotencyKey: `daily-digest:${input.memberId}:${local.date}`,
      reminderDedupeKey: null, deliveryType: 'daily_digest', channel: 'planned', groupingKey: `daily:${local.date}`,
      title: locale === 'en' ? 'Today in Rodinka' : 'Dnes v Rodince', body: digestSummary(dailyItems, locale),
      deepLink: '/reminders', importance: dailyItems.some((item) => item.importance === 'important') ? 'important' : 'normal',
      scheduledFor: scheduledFor.toISOString(), metadata: { localDate: local.date, reminderKeys: dailyItems.map((item) => item.dedupeKey) },
    })
  }

  const weeklyWeekday = input.weeklyWeekday ?? 7
  const weeklyTime = input.weeklyTime ?? '18:00'
  const weeklyItems = digestCandidates(actionable, local.date, 7)
  if (!preferences.dailyDigestEnabled && preferences.weeklyDigestEnabled && localWeekday(local.date) === weeklyWeekday && currentMinutes >= minutes(weeklyTime) && weeklyItems.length > 0) {
    const week = localIsoWeek(local.date)
    const desired = zonedDateTimeToUtc(local.date, weeklyTime, preferences.timezone)
    const scheduledFor = deferPastQuietHours(desired > input.now ? desired : input.now, preferences)
    deliveries.push({
      idempotencyKey: `weekly-digest:${input.memberId}:${week}`,
      reminderDedupeKey: null, deliveryType: 'weekly_digest', channel: 'planned', groupingKey: `weekly:${week}`,
      title: locale === 'en' ? 'Your upcoming week' : 'Nadcházející týden', body: digestSummary(weeklyItems, locale),
      deepLink: '/reminders', importance: weeklyItems.some((item) => item.importance === 'important') ? 'important' : 'normal',
      scheduledFor: scheduledFor.toISOString(), metadata: { localWeek: week, reminderKeys: weeklyItems.map((item) => item.dedupeKey) },
    })
  }

  return deliveries
}
