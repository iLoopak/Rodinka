import type { Route } from '../router'
import type { Activity } from '../features/activities/domain/activityTypes'
import type { Chore } from '../hooks/useChores'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'
import type { MealPlanEntry, MealSlot } from '../features/meals/domain/mealTypes'
import type { MealVoteRound } from '../features/meals/domain/mealTypes'
import type { MedicalRecord } from '../hooks/useMedicalRecords'
import { t } from '../strings'
import { buildCalendarEntries, entryMatchesMember, type CalendarEntry } from './calendarEntries'
import { getChoreState } from './choreState'
import { compareISODates, todayISODate } from './dueDate'
import { isMedicalRecordOverdue } from './medicalDueState'
import type { CalendarItemType } from './itemTypeStyle'
import type { AllowancePlan } from '../hooks/useAllowancePlans'
import type { AllowanceCycle } from '../hooks/useAllowancePlans'
import { allowanceCycleForPayout, evaluateAllowanceRequirements, unsettledDuePayoutDates } from './allowanceCycles'
import { getEffectiveOccurrenceMember, type ActivityParticipantHistory, type OccurrenceOverride, type SeriesAssignmentHistory } from './occurrenceAssignments'

const MEAL_SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
  other: 4,
}

function todayEntryGroup(entry: CalendarEntry): number {
  if (entry.time) return 0
  if (entry.type === 'meal') return 2
  return 1
}

export function compareTodayEntries(a: CalendarEntry, b: CalendarEntry): number {
  const groupCompare = todayEntryGroup(a) - todayEntryGroup(b)
  if (groupCompare !== 0) return groupCompare

  if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time)

  if (a.type === 'meal' && b.type === 'meal') {
    const slotCompare = MEAL_SLOT_ORDER[a.mealSlot ?? 'other'] - MEAL_SLOT_ORDER[b.mealSlot ?? 'other']
    if (slotCompare !== 0) return slotCompare
  }

  return a.title.localeCompare(b.title)
}

export function isChildTodayEntryVisible(entry: CalendarEntry, childId: string): boolean {
  return entry.type !== 'payment' && (entry.type === 'meal' || entryMatchesMember(entry, childId))
}

interface TodayEntriesInput {
  chores: Chore[]
  activities: Activity[]
  medicalRecords: MedicalRecord[]
  mealPlanEntries: MealPlanEntry[]
  allowancePlans?: AllowancePlan[]
  occurrenceOverrides?: OccurrenceOverride[]
  assignmentHistory?: SeriesAssignmentHistory[]
  participantHistory?: ActivityParticipantHistory[]
  latestCompletionFor: (choreId: string) => ChoreCompletion | null
  today?: string
}

export function buildTodayEntries({
  chores,
  activities,
  medicalRecords,
  mealPlanEntries,
  allowancePlans = [],
  occurrenceOverrides = [],
  assignmentHistory = [],
  participantHistory = [],
  latestCompletionFor,
  today = todayISODate(),
}: TodayEntriesInput): CalendarEntry[] {
  const actionableChores = chores.filter(
    (chore) => getChoreState(chore, latestCompletionFor(chore.id)) === 'actionable'
  )
  const visibleMedicalRecords = medicalRecords.filter((record) => record.status !== 'cancelled')

  return buildCalendarEntries({
    chores: actionableChores,
    activities,
    medicalRecords: visibleMedicalRecords,
    mealPlanEntries,
    allowancePlans,
    occurrenceOverrides,
    assignmentHistory,
    participantHistory,
    rangeStart: today,
    rangeEnd: today,
  }).sort(compareTodayEntries)
}

export type TodayAttentionKind = 'overdue_chore' | 'overdue_payment' | 'overdue_medical' | 'meal_vote' | 'allowance_due'

export interface TodayAttentionItem {
  id: string
  kind: TodayAttentionKind
  itemType: CalendarItemType
  title: string
  personId: string | null
  responsibleMemberId: string | null
  date: string | null
  route: Route
  hash?: string
  /** For overdue_chore items: the chore's source id, used to complete inline. */
  choreId?: string
}

export function isChildTodayAttentionVisible(item: TodayAttentionItem, childId: string): boolean {
  return item.kind === 'meal_vote' || (item.kind === 'overdue_chore' && item.personId === childId)
}

interface TodayAttentionInput {
  chores: Chore[]
  activities: Activity[]
  medicalRecords: MedicalRecord[]
  voteRounds: MealVoteRound[]
  allowancePlans?: AllowancePlan[]
  allowanceCycles?: AllowanceCycle[]
  completions?: ChoreCompletion[]
  currentMemberId: string
  occurrenceOverrides?: OccurrenceOverride[]
  assignmentHistory?: SeriesAssignmentHistory[]
  latestCompletionFor: (choreId: string) => ChoreCompletion | null
  today?: string
}

function overdueMedicalDate(record: MedicalRecord, today: string): string | null {
  const dates = [
    record.status === 'planned' ? record.record_date : null,
    record.next_due_date,
    record.vaccine_next_dose_date,
  ].filter((date): date is string => date !== null && compareISODates(date, today) < 0)
  return dates.sort(compareISODates)[0] ?? null
}

export function buildTodayAttentionItems({
  chores,
  activities,
  medicalRecords,
  voteRounds,
  allowancePlans = [],
  allowanceCycles = [],
  completions = [],
  currentMemberId,
  occurrenceOverrides = [],
  assignmentHistory = [],
  latestCompletionFor,
  today = todayISODate(),
}: TodayAttentionInput): TodayAttentionItem[] {
  const items: TodayAttentionItem[] = []

  for (const plan of allowancePlans) {
    const dueDates = unsettledDuePayoutDates(
      plan,
      allowanceCycles.filter((cycle) => cycle.plan_id === plan.id).map((cycle) => cycle.payout_date),
      today
    )
    const payoutDate = dueDates[0]
    if (!payoutDate) continue
    const evaluation = evaluateAllowanceRequirements(
      plan.member_id, plan.condition_mode, plan.requirements, completions,
      allowanceCycleForPayout(plan, payoutDate)
    )
    items.push({
      id: `allowance-due:${plan.id}:${payoutDate}`,
      kind: 'allowance_due',
      itemType: 'allowance',
      title: `${t.allowance.monthly} · ${evaluation.eligible ? t.allowance.conditionsMet : t.allowance.conditionsMissing}`,
      personId: plan.member_id,
      responsibleMemberId: null,
      date: payoutDate,
      route: '/chores',
      hash: '#allowance',
    })
  }

  for (const chore of chores) {
    if (!chore.due_date) continue
    if (chore.due_date >= today) continue
    if (getChoreState(chore, latestCompletionFor(chore.id)) !== 'actionable') continue
    const effectiveAssignee = getEffectiveOccurrenceMember({
      seriesType: 'task', seriesId: chore.id, occurrenceDate: chore.due_date,
      defaultMemberId: chore.assigned_to, overrides: occurrenceOverrides, assignmentHistory,
    }).memberId
    items.push({
      id: `overdue-chore:${chore.id}`,
      kind: 'overdue_chore',
      itemType: 'chore',
      title: chore.title,
      personId: effectiveAssignee,
      responsibleMemberId: effectiveAssignee,
      date: chore.due_date,
      route: '/chores',
      choreId: chore.id,
    })
  }

  for (const activity of activities) {
    if (
      activity.status === 'finished' ||
      !activity.next_payment_due_date ||
      activity.next_payment_due_date >= today
    ) {
      continue
    }
    items.push({
      id: `overdue-payment:${activity.id}`,
      kind: 'overdue_payment',
      itemType: 'payment',
      title: t.calendar.paymentTitle(activity.title),
      personId: activity.participant_ids[0] ?? activity.child_id,
      responsibleMemberId: activity.responsible_member_id,
      date: activity.next_payment_due_date,
      route: '/activities',
    })
  }

  for (const record of medicalRecords) {
    if (record.status === 'cancelled') continue
    if (!isMedicalRecordOverdue(record, today)) continue
    items.push({
      id: `overdue-medical:${record.id}`,
      kind: 'overdue_medical',
      itemType: record.record_type === 'vaccination' ? 'vaccination' : 'medical',
      title: record.title,
      personId: record.patient_id,
      responsibleMemberId: record.responsible_member_id,
      date: overdueMedicalDate(record, today),
      route: '/health',
    })
  }

  for (const round of voteRounds) {
    if (round.status !== 'open' || round.candidates.length === 0) continue
    const needsVote = round.candidates.some(
      (candidate) => !candidate.votes.some((vote) => vote.member_id === currentMemberId)
    )
    if (!needsVote) continue
    items.push({
      id: `meal-vote:${round.id}`,
      kind: 'meal_vote',
      itemType: 'meal',
      title: round.title,
      personId: currentMemberId,
      responsibleMemberId: currentMemberId,
      date: null,
      route: '/meals',
      hash: '#vote',
    })
  }

  return items.sort((a, b) => {
    if (a.date && b.date) return compareISODates(a.date, b.date)
    if (a.date) return -1
    if (b.date) return 1
    return a.title.localeCompare(b.title)
  })
}
