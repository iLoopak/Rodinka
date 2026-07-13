import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import type { Member } from '../hooks/useFamily'
import { useFamilyMembers, type FamilyMember } from '../hooks/useFamilyMembers'
import { useChores, type Chore } from '../hooks/useChores'
import { useChoreCompletions, type ChoreCompletion } from '../hooks/useChoreCompletions'
import { useAllowanceLedger } from '../hooks/useAllowanceLedger'
import {
  useActivities,
  type Activity,
  type ActivityCategory,
  type ActivityPaymentFrequency,
  type ActivityRecurrenceType,
  type ActivityStatus,
} from '../hooks/useActivities'
import {
  useMedicalRecords,
  type MedicalRecord,
  type MedicalRecordType,
  type MedicalStatus,
} from '../hooks/useMedicalRecords'
import { compareChoresByDueDate } from '../utils/dueDate'
import { useMealsData, type MealInput, type PlanEntryInput, type VoteRoundInput } from './useMealsData'
import type { Meal } from '../hooks/useMeals'
import type { MealVoteRound, VoteValue } from '../hooks/useMealVoteRounds'
import type { MealPlanEntry } from '../hooks/useMealPlanEntries'

export interface ActivityInput {
  title: string
  category: ActivityCategory
  childId: string
  responsibleMemberId: string | null
  secondaryResponsibleMemberId: string | null
  location: string
  coachName: string
  coachPhone: string
  coachEmail: string
  notes: string
  skillLevel: string
  startDate: string
  endDate: string | null
  recurrenceType: ActivityRecurrenceType
  recurrenceWeekdays: number[] | null
  startTime: string | null
  endTime: string | null
  paymentAmount: number | null
  paymentFrequency: ActivityPaymentFrequency | null
  nextPaymentDueDate: string | null
  status: ActivityStatus
  reminderEnabled: boolean
  reminderDaysBefore: number | null
}

function activityInputToRow(input: ActivityInput) {
  return {
    title: input.title,
    category: input.category,
    child_id: input.childId,
    responsible_member_id: input.responsibleMemberId,
    secondary_responsible_member_id: input.secondaryResponsibleMemberId,
    location: input.location || null,
    coach_name: input.coachName || null,
    coach_phone: input.coachPhone || null,
    coach_email: input.coachEmail || null,
    notes: input.notes || null,
    skill_level: input.skillLevel || null,
    start_date: input.startDate,
    end_date: input.endDate,
    recurrence_type: input.recurrenceType,
    recurrence_weekdays: input.recurrenceWeekdays,
    start_time: input.startTime,
    end_time: input.endTime,
    payment_amount: input.paymentAmount,
    payment_frequency: input.paymentFrequency,
    next_payment_due_date: input.nextPaymentDueDate,
    status: input.status,
    reminder_enabled: input.reminderEnabled,
    reminder_days_before: input.reminderDaysBefore,
  }
}

export interface MedicalRecordInput {
  patientId: string
  responsibleMemberId: string | null
  recordType: MedicalRecordType
  title: string
  provider: string
  location: string
  recordDate: string
  startTime: string | null
  endTime: string | null
  status: MedicalStatus
  notes: string
  nextDueDate: string | null
  recurrenceIntervalMonths: number | null
  reminderEnabled: boolean
  reminderDaysBefore: number | null
  vaccineName: string
  vaccineDoseNumber: number | null
  vaccineBatchNumber: string
  vaccineCompletedDate: string | null
  vaccineNextDoseDate: string | null
}

function medicalInputToRow(input: MedicalRecordInput) {
  return {
    patient_id: input.patientId,
    responsible_member_id: input.responsibleMemberId,
    record_type: input.recordType,
    title: input.title,
    provider: input.provider || null,
    location: input.location || null,
    record_date: input.recordDate,
    start_time: input.startTime,
    end_time: input.endTime,
    status: input.status,
    notes: input.notes || null,
    next_due_date: input.nextDueDate,
    recurrence_interval_months: input.recurrenceIntervalMonths,
    reminder_enabled: input.reminderEnabled,
    reminder_days_before: input.reminderDaysBefore,
    vaccine_name: input.vaccineName || null,
    vaccine_dose_number: input.vaccineDoseNumber,
    vaccine_batch_number: input.vaccineBatchNumber || null,
    vaccine_completed_date: input.vaccineCompletedDate,
    vaccine_next_dose_date: input.vaccineNextDoseDate,
  }
}

// Single shared data layer for Today/Chores/Family so they don't each
// independently re-fetch members/chores/completions/ledger, and so a
// mutation in one screen (e.g. approving on Today) is reflected everywhere.

interface FamilyDataContextValue {
  familyId: string
  userId: string
  userEmail: string
  currentMember: Member
  isParentOrAdmin: boolean
  familyName: string | null
  members: FamilyMember[]
  kids: FamilyMember[]
  chores: Chore[]
  completions: ChoreCompletion[]
  pendingCompletions: ChoreCompletion[]
  activities: Activity[]
  medicalRecords: MedicalRecord[]
  meals: Meal[]
  voteRounds: MealVoteRound[]
  planEntries: MealPlanEntry[]
  balances: Map<string, number>
  memberName: (id: string) => string
  latestCompletionFor: (choreId: string) => ChoreCompletion | null
  loading: boolean
  error: string | null
  addChild: (displayName: string) => Promise<void>
  addChore: (input: {
    title: string
    description: string
    assignedTo: string
    dueDate: string
    rewardAmount: number
    recurring: boolean
  }) => Promise<void>
  markDone: (choreId: string, assignedTo: string) => Promise<void>
  approve: (completionId: string) => Promise<void>
  reject: (completionId: string) => Promise<void>
  payout: (memberId: string, amount: number, reason: string) => Promise<void>
  createInvite: () => Promise<{ code: string; expiresAt: string | null }>
  addActivity: (input: ActivityInput) => Promise<void>
  updateActivity: (id: string, input: ActivityInput) => Promise<void>
  addMedicalRecord: (input: MedicalRecordInput) => Promise<void>
  updateMedicalRecord: (id: string, input: MedicalRecordInput) => Promise<void>
  addMeal: (input: MealInput) => Promise<void>
  updateMeal: (id: string, input: MealInput) => Promise<void>
  createVoteRound: (input: VoteRoundInput, openImmediately: boolean) => Promise<string>
  addCandidatesToRound: (roundId: string, mealIds: string[]) => Promise<void>
  openRound: (roundId: string) => Promise<void>
  closeRound: (roundId: string) => Promise<void>
  castVote: (candidateId: string, memberId: string, value: VoteValue) => Promise<void>
  addPlanEntry: (input: PlanEntryInput) => Promise<void>
  updatePlanEntry: (id: string, input: PlanEntryInput) => Promise<void>
  deletePlanEntry: (id: string) => Promise<void>
  copyWeek: (fromWeekStart: string, toWeekStart: string) => Promise<void>
  refreshAll: () => Promise<void>
}

const FamilyDataContext = createContext<FamilyDataContextValue | null>(null)

// Supabase error messages aren't meant for end users (raw constraint names,
// English text). Log the real one for debugging, surface a generic string.
function friendly(error: { message: string }): Error {
  console.error(error.message)
  return new Error(t.errors.generic)
}

interface ProviderProps {
  member: Member
  userId: string
  userEmail: string
  children: ReactNode
}

export function FamilyDataProvider({ member, userId, userEmail, children }: ProviderProps) {
  const familyId = member.family_id

  const {
    members,
    loading: membersLoading,
    error: membersError,
    refresh: refreshMembers,
  } = useFamilyMembers(familyId)
  const {
    chores: rawChores,
    loading: choresLoading,
    error: choresError,
    refresh: refreshChores,
  } = useChores(familyId)
  const {
    completions,
    loading: completionsLoading,
    error: completionsError,
    refresh: refreshCompletions,
  } = useChoreCompletions(familyId)
  const {
    entries,
    loading: ledgerLoading,
    error: ledgerError,
    refresh: refreshLedger,
  } = useAllowanceLedger(familyId)
  const {
    activities,
    loading: activitiesLoading,
    error: activitiesError,
    refresh: refreshActivities,
  } = useActivities(familyId)
  const {
    medicalRecords,
    loading: medicalLoading,
    error: medicalError,
    refresh: refreshMedicalRecords,
  } = useMedicalRecords(familyId)
  const {
    meals,
    voteRounds,
    planEntries,
    loading: mealsDataLoading,
    error: mealsDataError,
    refreshMealsData,
    addMeal,
    updateMeal,
    createVoteRound,
    addCandidatesToRound,
    openRound,
    closeRound,
    castVote,
    addPlanEntry,
    updatePlanEntry,
    deletePlanEntry,
    copyWeek,
  } = useMealsData(familyId, userId)

  const [familyName, setFamilyName] = useState<string | null>(null)
  const [familyNameError, setFamilyNameError] = useState<string | null>(null)

  const refreshFamilyName = useCallback(async () => {
    const { data, error } = await supabase.from('families').select('name').eq('id', familyId).single()
    if (error) {
      console.error('Failed to load family name:', error.message)
      setFamilyNameError(t.errors.loadFailed)
    } else {
      setFamilyName(data.name)
      setFamilyNameError(null)
    }
  }, [familyId])

  useEffect(() => {
    refreshFamilyName()
  }, [refreshFamilyName])

  const isParentOrAdmin = member.role === 'admin' || member.role === 'parent'

  // Sorted once here (overdue/earliest due date first) so every screen that
  // reads `chores` from context gets consistent ordering for free.
  const chores = useMemo(() => [...rawChores].sort(compareChoresByDueDate), [rawChores])

  const kids = useMemo(() => members.filter((m) => m.role === 'child'), [members])

  const memberName = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m.display_name]))
    return (id: string) => byId.get(id) ?? '?'
  }, [members])

  const latestCompletionFor = useMemo(() => {
    // `completions` is ordered newest-first by the hook, so the first match is the latest.
    return (choreId: string) => completions.find((c) => c.chore_id === choreId) ?? null
  }, [completions])

  const balances = useMemo(() => {
    const totals = new Map<string, number>()
    for (const entry of entries) {
      totals.set(entry.member_id, (totals.get(entry.member_id) ?? 0) + Number(entry.amount))
    }
    return totals
  }, [entries])

  const pendingCompletions = useMemo(
    () => completions.filter((c) => c.status === 'pending_approval'),
    [completions]
  )

  const loading =
    membersLoading ||
    choresLoading ||
    completionsLoading ||
    ledgerLoading ||
    activitiesLoading ||
    medicalLoading ||
    mealsDataLoading
  const error =
    membersError ||
    choresError ||
    completionsError ||
    ledgerError ||
    familyNameError ||
    activitiesError ||
    medicalError ||
    mealsDataError

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshMembers(),
      refreshChores(),
      refreshCompletions(),
      refreshLedger(),
      refreshFamilyName(),
      refreshActivities(),
      refreshMedicalRecords(),
      refreshMealsData(),
    ])
  }, [
    refreshMembers,
    refreshChores,
    refreshCompletions,
    refreshLedger,
    refreshFamilyName,
    refreshActivities,
    refreshMedicalRecords,
    refreshMealsData,
  ])

  const addChild = useCallback(
    async (displayName: string) => {
      const { error } = await supabase
        .from('members')
        .insert({ family_id: familyId, display_name: displayName, role: 'child' })
      if (error) throw friendly(error)
      await refreshMembers()
    },
    [familyId, refreshMembers]
  )

  const addChore = useCallback(
    async (input: {
      title: string
      description: string
      assignedTo: string
      dueDate: string
      rewardAmount: number
      recurring: boolean
    }) => {
      const { error } = await supabase.from('chores').insert({
        family_id: familyId,
        title: input.title,
        description: input.description || null,
        assigned_to: input.assignedTo,
        due_date: input.dueDate,
        reward_amount: input.rewardAmount,
        recurring: input.recurring,
        created_by: userId,
      })
      if (error) throw friendly(error)
      await refreshChores()
    },
    [familyId, userId, refreshChores]
  )

  const markDone = useCallback(
    async (choreId: string, assignedTo: string) => {
      const { error } = await supabase
        .from('chore_completions')
        .insert({ chore_id: choreId, completed_by: assignedTo })
      if (error) throw friendly(error)
      await refreshCompletions()
    },
    [refreshCompletions]
  )

  const approve = useCallback(
    async (completionId: string) => {
      const { error } = await supabase.rpc('approve_chore_completion', { completion_id: completionId })
      if (error) throw friendly(error)
      await Promise.all([refreshCompletions(), refreshLedger()])
    },
    [refreshCompletions, refreshLedger]
  )

  const reject = useCallback(
    async (completionId: string) => {
      const { error } = await supabase.rpc('reject_chore_completion', { completion_id: completionId })
      if (error) throw friendly(error)
      await refreshCompletions()
    },
    [refreshCompletions]
  )

  const payout = useCallback(
    async (memberId: string, amount: number, reason: string) => {
      const { error } = await supabase.rpc('record_payout', {
        target_member_id: memberId,
        payout_amount: amount,
        payout_reason: reason || null,
      })
      if (error) throw friendly(error)
      await refreshLedger()
    },
    [refreshLedger]
  )

  const createInvite = useCallback(async () => {
    const { data: code, error } = await supabase.rpc('create_invite', { fid: familyId })
    if (error) throw friendly(error)
    // Best-effort: fetch expiry for display. Not fatal if this second read fails.
    const { data: invite } = await supabase.from('invites').select('expires_at').eq('code', code).single()
    return { code: code as string, expiresAt: invite?.expires_at ?? null }
  }, [familyId])

  const addActivity = useCallback(
    async (input: ActivityInput) => {
      const { error } = await supabase
        .from('activities')
        .insert({ family_id: familyId, created_by: userId, ...activityInputToRow(input) })
      if (error) throw friendly(error)
      await refreshActivities()
    },
    [familyId, userId, refreshActivities]
  )

  const updateActivity = useCallback(
    async (id: string, input: ActivityInput) => {
      const { error } = await supabase
        .from('activities')
        .update({ ...activityInputToRow(input), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw friendly(error)
      await refreshActivities()
    },
    [refreshActivities]
  )

  const addMedicalRecord = useCallback(
    async (input: MedicalRecordInput) => {
      const { error } = await supabase
        .from('medical_records')
        .insert({ family_id: familyId, created_by: userId, ...medicalInputToRow(input) })
      if (error) throw friendly(error)
      await refreshMedicalRecords()
    },
    [familyId, userId, refreshMedicalRecords]
  )

  const updateMedicalRecord = useCallback(
    async (id: string, input: MedicalRecordInput) => {
      const { error } = await supabase
        .from('medical_records')
        .update({ ...medicalInputToRow(input), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw friendly(error)
      await refreshMedicalRecords()
    },
    [refreshMedicalRecords]
  )

  const value: FamilyDataContextValue = {
    familyId,
    userId,
    userEmail,
    currentMember: member,
    isParentOrAdmin,
    familyName,
    members,
    kids,
    chores,
    completions,
    pendingCompletions,
    activities,
    medicalRecords,
    meals,
    voteRounds,
    planEntries,
    balances,
    memberName,
    latestCompletionFor,
    loading,
    error,
    addChild,
    addChore,
    markDone,
    approve,
    reject,
    payout,
    createInvite,
    addActivity,
    updateActivity,
    addMedicalRecord,
    updateMedicalRecord,
    addMeal,
    updateMeal,
    createVoteRound,
    addCandidatesToRound,
    openRound,
    closeRound,
    castVote,
    addPlanEntry,
    updatePlanEntry,
    deletePlanEntry,
    copyWeek,
    refreshAll,
  }

  return <FamilyDataContext.Provider value={value}>{children}</FamilyDataContext.Provider>
}

export function useFamilyData() {
  const ctx = useContext(FamilyDataContext)
  if (!ctx) throw new Error('useFamilyData must be used within a FamilyDataProvider')
  return ctx
}
