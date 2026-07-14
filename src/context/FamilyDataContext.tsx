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
  type ActivityKind,
} from '../hooks/useActivities'
import { useAllowancePlans, type AllowanceCycle, type AllowancePlan, type AllowancePlanInput } from '../hooks/useAllowancePlans'
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
import { useShoppingData } from './useShoppingData'
import { createMemberLookup, resolveCurrentMember } from '../utils/memberLookup'
import { useMemberProfiles } from '../hooks/useMemberProfiles'
import { choreInputToRow, type ChoreInput } from '../utils/choreModel'
import { todayISODate } from '../utils/dueDate'

export type { ChoreInput } from '../utils/choreModel'

export interface ChoreApprovalResult {
  choreId: string
  nextDueDate: string | null
}

export interface ActivityInput {
  title: string
  category: ActivityCategory
  kind: ActivityKind
  allDay: boolean
  participantIds: string[]
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
    kind: input.kind,
    all_day: input.allDay,
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

interface FamilyDataContextValue extends ReturnType<typeof useShoppingData> {
  familyId: string
  userId: string
  userEmail: string
  currentMember: FamilyMember
  isParentOrAdmin: boolean
  familyName: string | null
  members: FamilyMember[]
  kids: FamilyMember[]
  chores: Chore[]
  completions: ChoreCompletion[]
  pendingCompletions: ChoreCompletion[]
  activities: Activity[]
  allowancePlans: AllowancePlan[]
  allowanceCycles: AllowanceCycle[]
  medicalRecords: MedicalRecord[]
  meals: Meal[]
  voteRounds: MealVoteRound[]
  planEntries: MealPlanEntry[]
  balances: Map<string, number>
  memberName: (id: string) => string
  memberById: (id: string) => FamilyMember | undefined
  latestCompletionFor: (choreId: string) => ChoreCompletion | null
  loading: boolean
  error: string | null
  addChild: (displayName: string, avatarFile?: File | null) => Promise<void>
  addChore: (input: ChoreInput) => Promise<void>
  updateChore: (id: string, input: ChoreInput) => Promise<void>
  setChoreArchived: (id: string, archived: boolean) => Promise<void>
  markDone: (choreId: string, assignedTo: string) => Promise<void>
  approve: (completionId: string) => Promise<ChoreApprovalResult>
  reject: (completionId: string) => Promise<void>
  payout: (memberId: string, amount: number, reason: string) => Promise<void>
  saveAllowancePlan: (input: AllowancePlanInput, planId?: string) => Promise<void>
  creditAllowance: (planId: string, payoutDate: string) => Promise<void>
  skipAllowance: (planId: string, payoutDate: string) => Promise<void>
  createInvite: () => Promise<{ code: string; expiresAt: string | null }>
  addActivity: (input: ActivityInput) => Promise<void>
  updateActivity: (id: string, input: ActivityInput) => Promise<void>
  markActivityPaymentPaid: (id: string) => Promise<void>
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
  refreshMembers: () => Promise<void>
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
  const { saveMemberProfile } = useMemberProfiles(refreshMembers)
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
    plans: allowancePlans,
    cycles: allowanceCycles,
    loading: allowancePlansLoading,
    error: allowancePlansError,
    refresh: refreshAllowancePlans,
  } = useAllowancePlans(familyId)
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
  const shoppingData = useShoppingData(familyId)

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

  // Sorted once here (overdue/earliest due date first) so every screen that
  // reads `chores` from context gets consistent ordering for free.
  const chores = useMemo(() => [...rawChores].sort(compareChoresByDueDate), [rawChores])

  const kids = useMemo(() => members.filter((m) => m.role === 'child'), [members])

  const memberById = useMemo(() => {
    return createMemberLookup(members)
  }, [members])

  const currentMember = resolveCurrentMember(member, memberById)
  const isParentOrAdmin = currentMember.role === 'admin' || currentMember.role === 'parent'

  const memberName = useMemo(() => {
    return (id: string) => memberById(id)?.display_name ?? '?'
  }, [memberById])

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
    allowancePlansLoading ||
    activitiesLoading ||
    medicalLoading ||
    mealsDataLoading ||
    shoppingData.shoppingLoading
  const error =
    membersError ||
    choresError ||
    completionsError ||
    ledgerError ||
    allowancePlansError ||
    familyNameError ||
    activitiesError ||
    medicalError ||
    mealsDataError ||
    shoppingData.shoppingError

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshMembers(),
      refreshChores(),
      refreshCompletions(),
      refreshLedger(),
      refreshAllowancePlans(),
      refreshFamilyName(),
      refreshActivities(),
      refreshMedicalRecords(),
      refreshMealsData(),
      shoppingData.refreshShopping(),
    ])
  }, [
    refreshMembers,
    refreshChores,
    refreshCompletions,
    refreshLedger,
    refreshAllowancePlans,
    refreshFamilyName,
    refreshActivities,
    refreshMedicalRecords,
    refreshMealsData,
    shoppingData,
  ])

  const addChild = useCallback(
    async (displayName: string, avatarFile: File | null = null) => {
      const { data, error } = await supabase
        .from('members')
        .insert({ family_id: familyId, display_name: displayName, role: 'child' })
        .select('id, family_id, display_name, role, user_id, birth_date, color_key, avatar_path, grammatical_gender')
        .single()
      if (error) throw friendly(error)
      if (avatarFile) {
        try {
          await saveMemberProfile({ ...data, avatar_url: null } as FamilyMember, {
            displayName,
            birthDate: null,
            colorKey: null,
            grammaticalGender: null,
            avatarFile,
            removeAvatar: false,
          })
        } catch (profileError) {
          const { error: rollbackError } = await supabase
            .from('members')
            .delete()
            .eq('id', data.id)
            .eq('family_id', familyId)
          if (rollbackError) console.error('Failed to roll back member after avatar upload failure:', rollbackError.message)
          await refreshMembers()
          throw profileError
        }
      } else {
        await refreshMembers()
      }
    },
    [familyId, refreshMembers, saveMemberProfile]
  )

  const addChore = useCallback(
    async (input: ChoreInput) => {
      const { error } = await supabase.from('chores').insert({
        family_id: familyId,
        created_by: userId,
        ...choreInputToRow(input),
      })
      if (error) throw friendly(error)
      await refreshChores()
    },
    [familyId, userId, refreshChores]
  )

  const updateChore = useCallback(
    async (id: string, input: ChoreInput) => {
      const { error } = await supabase
        .from('chores')
        .update(choreInputToRow(input))
        .eq('id', id)
        .eq('family_id', familyId)
      if (error) throw friendly(error)
      await refreshChores()
    },
    [familyId, refreshChores]
  )

  const setChoreArchived = useCallback(
    async (id: string, archived: boolean) => {
      const { error } = await supabase
        .from('chores')
        .update({ status: archived ? 'archived' : 'active' })
        .eq('id', id)
        .eq('family_id', familyId)
      if (error) throw friendly(error)
      await refreshChores()
    },
    [familyId, refreshChores]
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
      const { data, error } = await supabase.rpc('approve_chore_completion', {
        completion_id: completionId,
        approval_date: todayISODate(),
      })
      if (error) throw friendly(error)
      await Promise.all([refreshChores(), refreshCompletions(), refreshLedger()])
      const result = data as { chore_id?: string; next_due_date?: string | null } | null
      return {
        choreId: result?.chore_id ?? '',
        nextDueDate: result?.next_due_date ?? null,
      }
    },
    [refreshChores, refreshCompletions, refreshLedger]
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

  const saveAllowancePlan = useCallback(async (input: AllowancePlanInput, planId?: string) => {
    const planData = {
      family_id: familyId,
      member_id: input.memberId,
      amount: input.amount,
      payout_day: input.payoutDay,
      starts_on: input.startsOn,
      status: input.status,
      condition_mode: input.conditionMode,
    }
    const { error } = await supabase.rpc('save_allowance_plan', {
      target_plan_id: planId ?? null,
      plan_data: planData,
      requirements_data: input.requirements.map((requirement) => ({
        chore_id: requirement.choreId,
        requirement_type: requirement.requirementType,
        required_count: requirement.requiredCount,
      })),
    })
    if (error) throw friendly(error)
    await refreshAllowancePlans()
  }, [familyId, refreshAllowancePlans])

  const creditAllowance = useCallback(async (planId: string, payoutDate: string) => {
    const { error } = await supabase.rpc('credit_monthly_allowance', { plan_id: planId, payout_date: payoutDate })
    if (error) throw friendly(error)
    await Promise.all([refreshAllowancePlans(), refreshLedger()])
  }, [refreshAllowancePlans, refreshLedger])

  const skipAllowance = useCallback(async (planId: string, payoutDate: string) => {
    const { error } = await supabase.rpc('skip_monthly_allowance', { plan_id: planId, payout_date: payoutDate })
    if (error) throw friendly(error)
    await refreshAllowancePlans()
  }, [refreshAllowancePlans])

  const createInvite = useCallback(async () => {
    const { data: code, error } = await supabase.rpc('create_invite', { fid: familyId })
    if (error) throw friendly(error)
    // Best-effort: fetch expiry for display. Not fatal if this second read fails.
    const { data: invite } = await supabase.from('invites').select('expires_at').eq('code', code).single()
    return { code: code as string, expiresAt: invite?.expires_at ?? null }
  }, [familyId])

  const addActivity = useCallback(
    async (input: ActivityInput) => {
      const { error } = await supabase.rpc('create_activity_with_participants', {
        activity_data: { family_id: familyId, ...activityInputToRow(input) },
        participant_ids: input.participantIds,
      })
      if (error) throw friendly(error)
      await refreshActivities()
    },
    [familyId, refreshActivities]
  )

  const updateActivity = useCallback(
    async (id: string, input: ActivityInput) => {
      const { error } = await supabase.rpc('update_activity_with_participants', {
        target_activity_id: id,
        activity_data: activityInputToRow(input),
        participant_ids: input.participantIds,
      })
      if (error) throw friendly(error)
      await refreshActivities()
    },
    [refreshActivities]
  )

  const markActivityPaymentPaid = useCallback(async (id: string) => {
    const activity = activities.find((item) => item.id === id)
    if (!activity?.next_payment_due_date) return
    const { error } = await supabase.from('activities').update({ payment_paid_at: new Date().toISOString(), payment_paid_for_date: activity.next_payment_due_date }).eq('id', id).eq('family_id', familyId)
    if (error) throw friendly(error)
    await refreshActivities()
  }, [activities, familyId, refreshActivities])

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
    currentMember,
    isParentOrAdmin,
    familyName,
    members,
    kids,
    chores,
    completions,
    pendingCompletions,
    activities,
    allowancePlans,
    allowanceCycles,
    medicalRecords,
    meals,
    voteRounds,
    planEntries,
    ...shoppingData,
    balances,
    memberName,
    memberById,
    latestCompletionFor,
    loading,
    error,
    addChild,
    addChore,
    updateChore,
    setChoreArchived,
    markDone,
    approve,
    reject,
    payout,
    saveAllowancePlan,
    creditAllowance,
    skipAllowance,
    createInvite,
    addActivity,
    updateActivity,
    markActivityPaymentPaid,
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
    refreshMembers,
  }

  return <FamilyDataContext.Provider value={value}>{children}</FamilyDataContext.Provider>
}

export function useFamilyData() {
  const ctx = useContext(FamilyDataContext)
  if (!ctx) throw new Error('useFamilyData must be used within a FamilyDataProvider')
  return ctx
}
