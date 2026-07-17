import { addDays, compareISODates, daysBetweenISO, todayISODate, toUTCDate } from './dueDate'

export type AllowancePlanStatus = 'active' | 'paused' | 'archived'
export type AllowanceConditionMode = 'none' | 'chores'
export type AllowanceRequirementType = 'per_cycle' | 'weekly'

export interface AllowancePlanDates {
  payout_day: number
  starts_on: string
  status: AllowancePlanStatus
}

export interface AllowanceCycleRange {
  payoutDate: string
  periodStart: string
  periodEnd: string
}

export interface DateBucket {
  start: string
  end: string
}

function isoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

export function payoutDateForMonth(year: number, monthIndex: number, payoutDay: number): string {
  if (!Number.isInteger(payoutDay) || payoutDay < 1 || payoutDay > 31) {
    throw new RangeError('payoutDay must be an integer between 1 and 31')
  }
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  return isoDate(year, monthIndex, Math.min(payoutDay, lastDay))
}

export function nextPayoutDate(fromDate: string, payoutDay: number): string {
  const from = toUTCDate(fromDate)
  const thisMonth = payoutDateForMonth(from.getUTCFullYear(), from.getUTCMonth(), payoutDay)
  if (compareISODates(thisMonth, fromDate) >= 0) return thisMonth
  return payoutDateForMonth(from.getUTCFullYear(), from.getUTCMonth() + 1, payoutDay)
}

export function previousPayoutDate(payoutDate: string, payoutDay: number): string {
  const date = toUTCDate(payoutDate)
  return payoutDateForMonth(date.getUTCFullYear(), date.getUTCMonth() - 1, payoutDay)
}

export function allowanceCycleForPayout(
  plan: Pick<AllowancePlanDates, 'payout_day' | 'starts_on'>,
  payoutDate: string
): AllowanceCycleRange {
  const expected = payoutDateForMonth(
    toUTCDate(payoutDate).getUTCFullYear(),
    toUTCDate(payoutDate).getUTCMonth(),
    plan.payout_day
  )
  if (expected !== payoutDate) throw new Error('payoutDate is not valid for this plan')
  const previous = previousPayoutDate(payoutDate, plan.payout_day)
  const periodStart = compareISODates(plan.starts_on, previous) > 0 ? plan.starts_on : previous
  return { payoutDate, periodStart, periodEnd: payoutDate }
}

export function nextCycleForPlan(plan: AllowancePlanDates, today: string = todayISODate()): AllowanceCycleRange | null {
  if (plan.status !== 'active') return null
  const from = compareISODates(today, plan.starts_on) < 0 ? plan.starts_on : today
  return allowanceCycleForPayout(plan, nextPayoutDate(from, plan.payout_day))
}

export function isCycleDue(cycle: AllowanceCycleRange, today: string = todayISODate()): boolean {
  return compareISODates(cycle.payoutDate, today) <= 0
}

export function unsettledDuePayoutDates(
  plan: Pick<AllowancePlanDates, 'payout_day' | 'starts_on' | 'status'>,
  settledDates: Iterable<string>,
  today: string = todayISODate()
): string[] {
  if (plan.status !== 'active') return []
  const settled = new Set(settledDates)
  const dates: string[] = []
  let cursor = nextPayoutDate(plan.starts_on, plan.payout_day)
  let guard = 0
  while (compareISODates(cursor, today) <= 0 && guard < 120) {
    if (!settled.has(cursor)) dates.push(cursor)
    const date = toUTCDate(cursor)
    cursor = payoutDateForMonth(date.getUTCFullYear(), date.getUTCMonth() + 1, plan.payout_day)
    guard++
  }
  return dates
}

function isoWeekday(date: string): number {
  const day = toUTCDate(date).getUTCDay()
  return day === 0 ? 7 : day
}

/**
 * Splits [periodStart, periodEnd) into Monday-Sunday buckets. Partial edge
 * weeks count only when at least four calendar days fall inside the cycle.
 */
export function weeklyRequirementBuckets(periodStart: string, periodEnd: string): DateBucket[] {
  if (compareISODates(periodStart, periodEnd) >= 0) return []
  const buckets: DateBucket[] = []
  let cursor = periodStart
  while (compareISODates(cursor, periodEnd) < 0) {
    const daysToSunday = 7 - isoWeekday(cursor)
    const mondayAfter = addDays(cursor, daysToSunday + 1)
    const end = compareISODates(mondayAfter, periodEnd) < 0 ? mondayAfter : periodEnd
    if (daysBetweenISO(cursor, end) >= 4) buckets.push({ start: cursor, end })
    cursor = end
  }
  return buckets
}

export interface RequirementProgress {
  choreId: string
  type: AllowanceRequirementType
  requiredCount: number
  approvedCount: number
  pendingCount: number
  satisfied: boolean
  weeklyBuckets?: Array<DateBucket & { approvedCount: number; pendingCount: number; satisfied: boolean }>
}

interface RequirementInput {
  chore_id: string
  requirement_type: AllowanceRequirementType
  required_count: number
}

interface CompletionInput {
  chore_id: string
  completed_by: string | null
  completed_at: string
  status: 'pending_approval' | 'approved' | 'rejected'
}

export function evaluateAllowanceRequirements(
  memberId: string,
  conditionMode: AllowanceConditionMode,
  requirements: RequirementInput[],
  completions: CompletionInput[],
  cycle: AllowanceCycleRange
): { eligible: boolean; progress: RequirementProgress[] } {
  if (conditionMode === 'none') return { eligible: true, progress: [] }
  const inRange = completions.filter((completion) => {
    const date = completion.completed_at.slice(0, 10)
    return completion.completed_by === memberId &&
      compareISODates(date, cycle.periodStart) >= 0 &&
      compareISODates(date, cycle.periodEnd) < 0
  })

  const progress = requirements.map((requirement): RequirementProgress => {
    const relevant = inRange.filter((completion) => completion.chore_id === requirement.chore_id)
    const approvedCount = relevant.filter((completion) => completion.status === 'approved').length
    const pendingCount = relevant.filter((completion) => completion.status === 'pending_approval').length
    if (requirement.requirement_type === 'per_cycle') {
      return {
        choreId: requirement.chore_id,
        type: requirement.requirement_type,
        requiredCount: requirement.required_count,
        approvedCount,
        pendingCount,
        satisfied: approvedCount >= requirement.required_count,
      }
    }
    const weeklyBuckets = weeklyRequirementBuckets(cycle.periodStart, cycle.periodEnd).map((bucket) => {
      const bucketCompletions = relevant.filter((completion) => {
        const date = completion.completed_at.slice(0, 10)
        return compareISODates(date, bucket.start) >= 0 && compareISODates(date, bucket.end) < 0
      })
      const bucketApproved = bucketCompletions.filter((completion) => completion.status === 'approved').length
      const bucketPending = bucketCompletions.filter((completion) => completion.status === 'pending_approval').length
      return {
        ...bucket,
        approvedCount: bucketApproved,
        pendingCount: bucketPending,
        satisfied: bucketApproved >= requirement.required_count,
      }
    })
    return {
      choreId: requirement.chore_id,
      type: requirement.requirement_type,
      requiredCount: requirement.required_count,
      approvedCount,
      pendingCount,
      satisfied: weeklyBuckets.every((bucket) => bucket.satisfied),
      weeklyBuckets,
    }
  })
  return { eligible: requirements.length > 0 && progress.every((item) => item.satisfied), progress }
}
