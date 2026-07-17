import { addDays, compareISODates, daysBetweenISO, todayISODate, toUTCDate } from './dueDate'

export type AllowancePlanStatus = 'active' | 'paused' | 'archived'
export type AllowanceConditionMode = 'none' | 'chores'
export type AllowanceRequirementType = 'per_cycle' | 'weekly'
export type AllowanceFrequency = 'weekly' | 'monthly'

/**
 * A plan's payout anchor. Monthly plans carry payout_day (1-31, clamped to
 * short months); weekly plans carry payout_weekday as an ISO weekday
 * (1 = Monday … 7 = Sunday). Exactly one of the two is set, which the
 * allowance_plans_schedule_check constraint enforces in the database.
 */
export interface AllowanceSchedule {
  frequency: AllowanceFrequency
  payout_day: number | null
  payout_weekday: number | null
  starts_on: string
}

export interface AllowancePlanDates extends AllowanceSchedule {
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

function isoWeekday(date: string): number {
  const day = toUTCDate(date).getUTCDay()
  return day === 0 ? 7 : day
}

export function payoutDateForMonth(year: number, monthIndex: number, payoutDay: number): string {
  if (!Number.isInteger(payoutDay) || payoutDay < 1 || payoutDay > 31) {
    throw new RangeError('payoutDay must be an integer between 1 and 31')
  }
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  return isoDate(year, monthIndex, Math.min(payoutDay, lastDay))
}

function monthlyAnchor(schedule: AllowanceSchedule): number {
  if (schedule.payout_day === null) throw new Error('A monthly allowance plan must have payout_day')
  return schedule.payout_day
}

function weeklyAnchor(schedule: AllowanceSchedule): number {
  const weekday = schedule.payout_weekday
  if (weekday === null || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new RangeError('A weekly allowance plan must have payout_weekday between 1 and 7')
  }
  return weekday
}

/** The first payout on or after fromDate. */
export function nextPayoutDate(fromDate: string, schedule: AllowanceSchedule): string {
  if (schedule.frequency === 'weekly') {
    const target = weeklyAnchor(schedule)
    return addDays(fromDate, (target - isoWeekday(fromDate) + 7) % 7)
  }
  const payoutDay = monthlyAnchor(schedule)
  const from = toUTCDate(fromDate)
  const thisMonth = payoutDateForMonth(from.getUTCFullYear(), from.getUTCMonth(), payoutDay)
  if (compareISODates(thisMonth, fromDate) >= 0) return thisMonth
  return payoutDateForMonth(from.getUTCFullYear(), from.getUTCMonth() + 1, payoutDay)
}

/** The payout one full cycle before payoutDate. */
export function previousPayoutDate(payoutDate: string, schedule: AllowanceSchedule): string {
  if (schedule.frequency === 'weekly') return addDays(payoutDate, -7)
  const payoutDay = monthlyAnchor(schedule)
  const date = toUTCDate(payoutDate)
  return payoutDateForMonth(date.getUTCFullYear(), date.getUTCMonth() - 1, payoutDay)
}

export function isValidPayoutDate(schedule: AllowanceSchedule, payoutDate: string): boolean {
  if (schedule.frequency === 'weekly') return isoWeekday(payoutDate) === weeklyAnchor(schedule)
  const date = toUTCDate(payoutDate)
  return payoutDateForMonth(date.getUTCFullYear(), date.getUTCMonth(), monthlyAnchor(schedule)) === payoutDate
}

export function allowanceCycleForPayout(schedule: AllowanceSchedule, payoutDate: string): AllowanceCycleRange {
  if (!isValidPayoutDate(schedule, payoutDate)) throw new Error('payoutDate is not valid for this plan')
  const previous = previousPayoutDate(payoutDate, schedule)
  const periodStart = compareISODates(schedule.starts_on, previous) > 0 ? schedule.starts_on : previous
  return { payoutDate, periodStart, periodEnd: payoutDate }
}

export function nextCycleForPlan(plan: AllowancePlanDates, today: string = todayISODate()): AllowanceCycleRange | null {
  if (plan.status !== 'active') return null
  const from = compareISODates(today, plan.starts_on) < 0 ? plan.starts_on : today
  return allowanceCycleForPayout(plan, nextPayoutDate(from, plan))
}

export function isCycleDue(cycle: AllowanceCycleRange, today: string = todayISODate()): boolean {
  return compareISODates(cycle.payoutDate, today) <= 0
}

// Ten years of cycles at either frequency: enough that a long-running plan
// still reports every unsettled date, while a bad anchor cannot spin forever.
function maxCyclesToWalk(frequency: AllowanceFrequency): number {
  return frequency === 'weekly' ? 520 : 120
}

export function unsettledDuePayoutDates(
  plan: AllowancePlanDates,
  settledDates: Iterable<string>,
  today: string = todayISODate()
): string[] {
  if (plan.status !== 'active') return []
  const settled = new Set(settledDates)
  const dates: string[] = []
  const limit = maxCyclesToWalk(plan.frequency)
  let cursor = nextPayoutDate(plan.starts_on, plan)
  let guard = 0
  while (compareISODates(cursor, today) <= 0 && guard < limit) {
    if (!settled.has(cursor)) dates.push(cursor)
    cursor = nextPayoutDate(addDays(cursor, 1), plan)
    guard++
  }
  return dates
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
