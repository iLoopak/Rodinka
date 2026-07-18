import type {
  ReminderActivity as Activity,
  ReminderChoreCompletion as ChoreCompletion,
  ReminderFamilyMember as FamilyMember,
  ReminderLocale,
  ReminderMealPlanEntry as MealPlanEntry,
  ReminderMealVoteRound as MealVoteRound,
  ReminderMedicalRecord as MedicalRecord,
} from './reminderSourceTypes.ts'
import type { ShoppingItem } from '../utils/shopping.ts'
import type { Chore } from '../utils/choreModel.ts'
import { getChoreState } from '../utils/choreState.ts'
import { addDays, compareISODates, daysBetweenISO } from '../utils/isoDate.ts'
import { expandActivityOccurrences } from '../utils/recurrence.ts'
import { getEffectiveOccurrenceMember, type OccurrenceOverride, type SeriesAssignmentHistory } from '../utils/occurrenceAssignments.ts'

export const REMINDER_CATEGORIES = ['chores', 'activities', 'medical', 'voting', 'meals', 'allowance', 'documents', 'shopping'] as const
export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number]
export type ReminderImportance = 'quiet' | 'normal' | 'important'
export type ReminderStatus = 'unread' | 'read' | 'resolved' | 'dismissed'
export type ReminderSource =
  | 'chore'
  | 'activity'
  | 'activity-payment'
  | 'medical-appointment'
  | 'vaccination'
  | 'voting'
  | 'meal-plan'
  | 'allowance'
  | 'document'
  | 'shopping'

export interface ReminderMetadata {
  sourceIds: string[]
  memberId?: string | null
  eventDate?: string | null
  count?: number
  overdue?: boolean
  thresholdDays?: number
  [key: string]: unknown
}

export interface ReminderDraft {
  dedupeKey: string
  source: ReminderSource
  type: string
  title: string
  description: string | null
  importance: ReminderImportance
  eventAt: string | null
  generatedAt: string
  expiresAt: string | null
  deepLink: string | null
  groupingKey: string | null
  metadata: ReminderMetadata
}

export interface ReminderRecord extends ReminderDraft {
  id: string
  familyId: string
  targetMemberId: string
  readAt: string | null
  dismissedAt: string | null
  resolvedAt: string | null
  lastSeenAt: string
  status: ReminderStatus
}

export type ReminderCategoryPreferences = Record<ReminderCategory, boolean>

export interface NotificationPreferences {
  memberId: string
  familyId: string
  inAppEnabled: boolean
  pushEnabled: boolean
  dailyDigestEnabled: boolean
  weeklyDigestEnabled: boolean
  quietPushEnabled: boolean
  quietHoursEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
  timezone: string
  timezoneMode: 'auto' | 'explicit'
  locale: ReminderLocale
  categories: ReminderCategoryPreferences
  /**
   * Messaging push switches (batch 4). They sit under `pushEnabled`: with
   * push off for the account none of them do anything, which is why they
   * can all default to on without becoming noisy.
   */
  messages: MessageNotificationPreferences
}

export interface MessageNotificationPreferences {
  direct: boolean
  group: boolean
  replyMention: boolean
  task: boolean
  entity: boolean
  sound: boolean
  /** Off means the push payload never carries real message text. */
  preview: boolean
}

export const DEFAULT_MESSAGE_PREFERENCES: MessageNotificationPreferences = {
  direct: true,
  group: true,
  replyMention: true,
  task: true,
  entity: true,
  sound: true,
  preview: true,
}

export const DEFAULT_CATEGORY_PREFERENCES: ReminderCategoryPreferences = {
  chores: true,
  activities: true,
  medical: true,
  voting: true,
  meals: true,
  allowance: true,
  documents: true,
  shopping: true,
}

export function defaultNotificationPreferences(memberId: string, familyId: string, timezone = browserTimezone(), locale: ReminderLocale = 'cs'): NotificationPreferences {
  return {
    memberId,
    familyId,
    inAppEnabled: true,
    pushEnabled: false,
    dailyDigestEnabled: false,
    weeklyDigestEnabled: false,
    quietPushEnabled: true,
    quietHoursEnabled: false,
    quietHoursStart: '21:00',
    quietHoursEnd: '07:00',
    timezone,
    timezoneMode: 'auto',
    locale,
    categories: { ...DEFAULT_CATEGORY_PREFERENCES },
    messages: { ...DEFAULT_MESSAGE_PREFERENCES },
  }
}

export function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
  catch { return 'UTC' }
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

export function todayInTimeZone(now: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export interface ReminderDocument {
  id: string
  family_id: string
  title: string
  expires_on: string
  important: boolean
  responsible_member_id: string | null
  status: 'active' | 'renewed' | 'archived'
}

export interface ReminderCopy {
  choreDueToday: (count: number, memberName: string) => string
  choreOverdue: (count: number, memberName: string) => string
  activitySoon: (title: string) => string
  activityPayment: (count: number) => string
  medicalTomorrow: string
  vaccinationDue: string
  votingCloses: (title: string) => string
  mealEmpty: string
  mealIncomplete: (count: number) => string
  allowancePending: (count: number) => string
  documentExpiry: (count: number) => string
  shoppingAssigned: (count: number) => string
  openDetail: string
  forMember: (name: string) => string
}

export interface GenerateReminderInput {
  familyId: string
  currentMember: FamilyMember
  isParentOrAdmin: boolean
  members: FamilyMember[]
  chores: Chore[]
  latestCompletionFor: (choreId: string) => ChoreCompletion | null
  activities: Activity[]
  occurrenceOverrides?: OccurrenceOverride[]
  assignmentHistory?: SeriesAssignmentHistory[]
  medicalRecords: MedicalRecord[]
  voteRounds: MealVoteRound[]
  planEntries: MealPlanEntry[]
  pendingCompletions: ChoreCompletion[]
  shoppingItems: ShoppingItem[]
  documents?: ReminderDocument[]
  preferences: NotificationPreferences
  copy: ReminderCopy
  now?: Date
}

const ACTIVITY_PAYMENT_LEAD_DAYS = 7
const VOTE_CLOSE_LEAD_HOURS = 48
const CORE_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'] as const

function reminderCategory(source: ReminderSource): ReminderCategory {
  if (source === 'chore') return 'chores'
  if (source === 'activity' || source === 'activity-payment') return 'activities'
  if (source === 'medical-appointment' || source === 'vaccination') return 'medical'
  if (source === 'voting') return 'voting'
  if (source === 'meal-plan') return 'meals'
  if (source === 'allowance') return 'allowance'
  if (source === 'document') return 'documents'
  return 'shopping'
}

export function applyReminderPreferences(reminders: ReminderDraft[], preferences: NotificationPreferences): ReminderDraft[] {
  if (!preferences.inAppEnabled) return []
  return reminders.filter((reminder) => preferences.categories[reminderCategory(reminder.source)])
}

function dateEventAt(date: string): string {
  return `${date}T12:00:00.000Z`
}

function memberName(members: FamilyMember[], id: string | null | undefined): string {
  return members.find((member) => member.id === id)?.display_name ?? '?'
}

function canActForMember(current: FamilyMember, isParentOrAdmin: boolean, members: FamilyMember[], targetId: string | null): boolean {
  if (!targetId) return isParentOrAdmin
  if (targetId === current.id) return true
  const target = members.find((member) => member.id === targetId)
  return isParentOrAdmin && target?.role === 'child'
}

function canHandleResponsibleRecord(current: FamilyMember, isParentOrAdmin: boolean, responsibleId: string | null, subjectId: string | null): boolean {
  if (responsibleId) return responsibleId === current.id
  return isParentOrAdmin || subjectId === current.id
}

function pushGroupedChores(reminders: ReminderDraft[], input: GenerateReminderInput, today: string, generatedAt: string) {
  const resolvedChores = input.chores.map((chore) => chore.due_date ? {
    ...chore,
    assigned_to: getEffectiveOccurrenceMember({
      seriesType: 'task', seriesId: chore.id, occurrenceDate: chore.due_date, defaultMemberId: chore.assigned_to,
      overrides: input.occurrenceOverrides ?? [], assignmentHistory: input.assignmentHistory,
    }).memberId,
  } : chore)
  const actionable = resolvedChores
    .filter((chore): chore is Chore & { due_date: string; assigned_to: string } => Boolean(chore.due_date && chore.assigned_to))
    .filter((chore) =>
    chore.status === 'active' &&
    compareISODates(chore.due_date, today) <= 0 &&
    getChoreState(chore, input.latestCompletionFor(chore.id)) === 'actionable' &&
    canActForMember(input.currentMember, input.isParentOrAdmin, input.members, chore.assigned_to)
    )
  for (const overdue of [false, true]) {
    const byAssignee = new Map<string, Array<Chore & { due_date: string; assigned_to: string }>>()
    for (const chore of actionable.filter((item) => (compareISODates(item.due_date, today) < 0) === overdue)) {
      const existing = byAssignee.get(chore.assigned_to)
      if (existing) existing.push(chore)
      else byAssignee.set(chore.assigned_to, [chore])
    }
    for (const [assigneeId, chores] of byAssignee) {
      const earliest = [...chores].sort((a, b) => compareISODates(a.due_date, b.due_date))[0]
      reminders.push({
        dedupeKey: overdue ? `chore-overdue:${assigneeId}` : `chore-today:${assigneeId}:${today}`,
        source: 'chore',
        type: overdue ? 'chore-overdue' : 'chore-due-today',
        title: overdue
          ? input.copy.choreOverdue(chores.length, memberName(input.members, assigneeId))
          : input.copy.choreDueToday(chores.length, memberName(input.members, assigneeId)),
        description: chores.length === 1 ? chores[0].title : chores.slice(0, 3).map((chore) => chore.title).join(', '),
        importance: overdue ? 'important' : 'normal',
        eventAt: dateEventAt(earliest.due_date),
        generatedAt,
        expiresAt: null,
        deepLink: chores.length === 1 ? `/chores?chore=${chores[0].id}` : '/chores',
        groupingKey: `chores:${overdue ? 'overdue' : 'today'}:${assigneeId}`,
        metadata: { sourceIds: chores.map((chore) => chore.id), memberId: assigneeId, eventDate: earliest.due_date, count: chores.length, overdue, occurrences: chores.map((chore) => `${chore.id}:${chore.due_date}`) },
      })
    }
  }
}

function pushActivities(reminders: ReminderDraft[], input: GenerateReminderInput, today: string, generatedAt: string) {
  const paymentGroups = new Map<string, Activity[]>()
  for (const activity of input.activities) {
    const subjectId = activity.participant_ids[0] ?? activity.child_id
    if (activity.status !== 'active') continue

    if (activity.reminder_enabled) {
      const lead = activity.reminder_days_before ?? 1
      const occurrence = expandActivityOccurrences(activity, today, addDays(today, lead))[0]
      const effectiveCompanion = occurrence ? getEffectiveOccurrenceMember({
        seriesType: 'activity', seriesId: activity.id, occurrenceDate: occurrence.date,
        defaultMemberId: activity.responsible_member_id, overrides: input.occurrenceOverrides ?? [], assignmentHistory: input.assignmentHistory,
      }).memberId : activity.responsible_member_id
      const canHandle = canHandleResponsibleRecord(input.currentMember, input.isParentOrAdmin, effectiveCompanion, subjectId)
      if (occurrence && canHandle) reminders.push({
        dedupeKey: `activity-soon:${occurrence.id}:${input.currentMember.id}`,
        source: 'activity',
        type: 'activity-starts-soon',
        title: input.copy.activitySoon(activity.title),
        description: subjectId ? input.copy.forMember(memberName(input.members, subjectId)) : null,
        importance: 'normal',
        eventAt: dateEventAt(occurrence.date),
        generatedAt,
        expiresAt: dateEventAt(addDays(occurrence.date, 1)),
        deepLink: `/activities?activity=${activity.id}`,
        groupingKey: `activity:${activity.id}`,
        metadata: { sourceIds: [activity.id], memberId: subjectId, eventDate: occurrence.date, count: 1 },
      })
    }

    if (activity.next_payment_due_date && compareISODates(activity.next_payment_due_date, addDays(today, ACTIVITY_PAYMENT_LEAD_DAYS)) <= 0) {
      if (!canHandleResponsibleRecord(input.currentMember, input.isParentOrAdmin, activity.responsible_member_id, subjectId)) continue
      if (activity.payment_paid_for_date === activity.next_payment_due_date) continue
      const groupId = activity.responsible_member_id ?? input.currentMember.id
      const existing = paymentGroups.get(groupId)
      if (existing) existing.push(activity)
      else paymentGroups.set(groupId, [activity])
    }
  }
  for (const [responsibleId, activities] of paymentGroups) {
    const earliest = [...activities].sort((a, b) => compareISODates(a.next_payment_due_date!, b.next_payment_due_date!))[0]
    const overdue = compareISODates(earliest.next_payment_due_date!, today) < 0
    reminders.push({
      dedupeKey: `activity-payment:${responsibleId}`,
      source: 'activity-payment',
      type: 'activity-payment-due',
      title: input.copy.activityPayment(activities.length),
      description: activities.slice(0, 3).map((activity) => activity.title).join(', '),
      importance: overdue ? 'important' : 'normal',
      eventAt: dateEventAt(earliest.next_payment_due_date!),
      generatedAt,
      expiresAt: null,
      deepLink: activities.length === 1 ? `/activities?activity=${activities[0].id}` : '/activities#payments',
      groupingKey: `activity-payment:${responsibleId}`,
      metadata: { sourceIds: activities.map((activity) => activity.id), memberId: responsibleId, eventDate: earliest.next_payment_due_date, count: activities.length, overdue },
    })
  }
}

function pushMedical(reminders: ReminderDraft[], input: GenerateReminderInput, today: string, generatedAt: string) {
  const tomorrow = addDays(today, 1)
  for (const record of input.medicalRecords) {
    if (record.status === 'cancelled') continue
    if (!canHandleResponsibleRecord(input.currentMember, input.isParentOrAdmin, record.responsible_member_id, record.patient_id)) continue
    if (record.status === 'planned' && record.record_date === tomorrow) reminders.push({
      dedupeKey: `medical-tomorrow:${record.id}:${record.record_date}:${input.currentMember.id}`,
      source: 'medical-appointment',
      type: 'medical-appointment-tomorrow',
      title: input.copy.medicalTomorrow,
      description: input.copy.forMember(memberName(input.members, record.patient_id)),
      importance: 'important',
      eventAt: dateEventAt(record.record_date),
      generatedAt,
      expiresAt: dateEventAt(addDays(record.record_date, 1)),
      deepLink: `/health?record=${record.id}`,
      groupingKey: `medical:${record.id}`,
      metadata: { sourceIds: [record.id], memberId: record.patient_id, eventDate: record.record_date, count: 1 },
    })
    const vaccinationDate = record.vaccine_next_dose_date
    if (record.record_type === 'vaccination' && vaccinationDate && compareISODates(vaccinationDate, addDays(today, 7)) <= 0) reminders.push({
      dedupeKey: `vaccination-due:${record.id}:${vaccinationDate}:${input.currentMember.id}`,
      source: 'vaccination',
      type: 'vaccination-due',
      title: input.copy.vaccinationDue,
      description: input.copy.forMember(memberName(input.members, record.patient_id)),
      importance: 'important',
      eventAt: dateEventAt(vaccinationDate),
      generatedAt,
      expiresAt: null,
      deepLink: `/health?record=${record.id}`,
      groupingKey: `vaccination:${record.id}`,
      metadata: { sourceIds: [record.id], memberId: record.patient_id, eventDate: vaccinationDate, count: 1, overdue: compareISODates(vaccinationDate, today) < 0 },
    })
  }
}

function pushVoting(reminders: ReminderDraft[], input: GenerateReminderInput, now: Date, generatedAt: string) {
  for (const round of input.voteRounds) {
    if (round.status !== 'open' || !round.deadline_at || round.candidates.length === 0) continue
    const deadline = new Date(round.deadline_at)
    const hours = (deadline.getTime() - now.getTime()) / 3_600_000
    if (hours < 0 || hours > VOTE_CLOSE_LEAD_HOURS) continue
    const hasVoted = round.candidates.some((candidate) => candidate.votes.some((vote) => vote.member_id === input.currentMember.id))
    if (hasVoted) continue
    reminders.push({
      dedupeKey: `voting-closes:${round.id}:${round.deadline_at}:${input.currentMember.id}`,
      source: 'voting',
      type: 'voting-closes-soon',
      title: input.copy.votingCloses(round.title),
      description: input.copy.openDetail,
      importance: 'normal',
      eventAt: deadline.toISOString(),
      generatedAt,
      expiresAt: deadline.toISOString(),
      deepLink: `/meals?round=${round.id}#vote`,
      groupingKey: `voting:${round.id}`,
      metadata: { sourceIds: [round.id], memberId: input.currentMember.id, count: 1 },
    })
  }
}

function pushMealPlan(reminders: ReminderDraft[], input: GenerateReminderInput, today: string, generatedAt: string) {
  if (!input.isParentOrAdmin) return
  const tomorrow = addDays(today, 1)
  const entries = input.planEntries.filter((entry) => entry.entry_date === tomorrow)
  const handledSlots = new Set(entries.map((entry) => entry.meal_slot))
  const missing = CORE_MEAL_SLOTS.filter((slot) => !handledSlots.has(slot))
  if (missing.length === 0) return
  reminders.push({
    dedupeKey: `meal-plan:${tomorrow}:${input.currentMember.id}`,
    source: 'meal-plan',
    type: entries.length === 0 ? 'meal-plan-empty' : 'meal-plan-incomplete',
    title: entries.length === 0 ? input.copy.mealEmpty : input.copy.mealIncomplete(missing.length),
    description: null,
    importance: 'quiet',
    eventAt: dateEventAt(tomorrow),
    generatedAt,
    expiresAt: dateEventAt(addDays(tomorrow, 1)),
    deepLink: `/meals?date=${tomorrow}`,
    groupingKey: `meal-plan:${tomorrow}`,
    metadata: { sourceIds: entries.map((entry) => entry.id), eventDate: tomorrow, count: missing.length, missingSlots: missing },
  })
}

function pushAllowance(reminders: ReminderDraft[], input: GenerateReminderInput, generatedAt: string) {
  if (!input.isParentOrAdmin || input.pendingCompletions.length === 0) return
  reminders.push({
    dedupeKey: `allowance-pending:${input.currentMember.id}`,
    source: 'allowance',
    type: 'allowance-pending-approval',
    title: input.copy.allowancePending(input.pendingCompletions.length),
    description: input.pendingCompletions.slice(0, 3).map((completion) => completion.chore_title).join(', '),
    importance: 'normal',
    eventAt: null,
    generatedAt,
    expiresAt: null,
    deepLink: '/chores#pending',
    groupingKey: `allowance-pending:${input.currentMember.id}`,
    metadata: { sourceIds: input.pendingCompletions.map((completion) => completion.id), count: input.pendingCompletions.length },
  })
}

function pushDocuments(reminders: ReminderDraft[], input: GenerateReminderInput, today: string, generatedAt: string) {
  const documents = (input.documents ?? []).filter((document) =>
    document.status === 'active' &&
    canActForMember(input.currentMember, input.isParentOrAdmin, input.members, document.responsible_member_id)
  )
  const thresholds = [30, 7, 1, 0]
  for (const threshold of thresholds) {
    const matching = documents.filter((document) => {
      const days = daysBetweenISO(today, document.expires_on)
      const activeThreshold = days <= 0 ? 0 : days <= 1 ? 1 : days <= 7 ? 7 : days <= 30 ? 30 : null
      return activeThreshold === threshold
    })
    if (matching.length === 0) continue
    const earliest = [...matching].sort((a, b) => compareISODates(a.expires_on, b.expires_on))[0]
    reminders.push({
      dedupeKey: `document-expiry:${threshold}:${input.currentMember.id}`,
      source: 'document',
      type: threshold === 0 ? 'document-expired' : `document-expiry-${threshold}`,
      title: input.copy.documentExpiry(matching.length),
      description: matching.length === 1 ? matching[0].title : null,
      importance: threshold <= 1 || matching.some((document) => document.important) ? 'important' : 'normal',
      eventAt: dateEventAt(earliest.expires_on),
      generatedAt,
      expiresAt: null,
      deepLink: null,
      groupingKey: `document-expiry:${threshold}`,
      metadata: { sourceIds: matching.map((document) => document.id), eventDate: earliest.expires_on, count: matching.length, thresholdDays: threshold, overdue: threshold === 0 },
    })
  }
}

function pushShopping(reminders: ReminderDraft[], input: GenerateReminderInput, generatedAt: string) {
  const assigned = input.shoppingItems.filter((item) =>
    !item.purchased &&
    item.archived_at === null &&
    item.responsible_member_id === input.currentMember.id &&
    item.created_by_member_id !== input.currentMember.id
  )
  if (assigned.length === 0) return
  reminders.push({
    dedupeKey: `shopping-assigned:${input.currentMember.id}`,
    source: 'shopping',
    type: 'shopping-assigned',
    title: input.copy.shoppingAssigned(assigned.length),
    description: assigned.slice(0, 3).map((item) => item.name).join(', '),
    importance: 'quiet',
    eventAt: null,
    generatedAt,
    expiresAt: null,
    deepLink: '/shopping?assignedTo=me',
    groupingKey: `shopping-assigned:${input.currentMember.id}`,
    metadata: { sourceIds: assigned.map((item) => item.id), memberId: input.currentMember.id, count: assigned.length },
  })
}

export function generateReminderDrafts(input: GenerateReminderInput): ReminderDraft[] {
  const now = input.now ?? new Date()
  const generatedAt = now.toISOString()
  const today = todayInTimeZone(now, input.preferences.timezone)
  const reminders: ReminderDraft[] = []
  pushGroupedChores(reminders, input, today, generatedAt)
  pushActivities(reminders, input, today, generatedAt)
  pushMedical(reminders, input, today, generatedAt)
  pushVoting(reminders, input, now, generatedAt)
  pushMealPlan(reminders, input, today, generatedAt)
  pushAllowance(reminders, input, generatedAt)
  pushDocuments(reminders, input, today, generatedAt)
  pushShopping(reminders, input, generatedAt)
  return applyReminderPreferences(reminders, input.preferences)
    .sort((a, b) => {
      const importance = { important: 0, normal: 1, quiet: 2 }
      const importanceDiff = importance[a.importance] - importance[b.importance]
      if (importanceDiff !== 0) return importanceDiff
      if (a.eventAt && b.eventAt) return a.eventAt.localeCompare(b.eventAt)
      if (a.eventAt) return -1
      if (b.eventAt) return 1
      return a.dedupeKey.localeCompare(b.dedupeKey)
    })
}

export function reminderStatus(record: Pick<ReminderRecord, 'readAt' | 'dismissedAt' | 'resolvedAt'>): ReminderStatus {
  if (record.dismissedAt) return 'dismissed'
  if (record.resolvedAt) return 'resolved'
  return record.readAt ? 'read' : 'unread'
}
