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
import { getChoreState } from '../utils/choreState'

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
  actionableChores: Chore[]
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
    rewardAmount: number
    recurring: boolean
  }) => Promise<void>
  markDone: (choreId: string, assignedTo: string) => Promise<void>
  approve: (completionId: string) => Promise<void>
  reject: (completionId: string) => Promise<void>
  payout: (memberId: string, amount: number, reason: string) => Promise<void>
  createInvite: () => Promise<{ code: string; expiresAt: string | null }>
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
  const { chores, loading: choresLoading, error: choresError, refresh: refreshChores } = useChores(familyId)
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

  const actionableChores = useMemo(
    () => chores.filter((chore) => getChoreState(chore, latestCompletionFor(chore.id)) === 'actionable'),
    [chores, latestCompletionFor]
  )

  const loading = membersLoading || choresLoading || completionsLoading || ledgerLoading
  const error = membersError || choresError || completionsError || ledgerError || familyNameError

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshMembers(),
      refreshChores(),
      refreshCompletions(),
      refreshLedger(),
      refreshFamilyName(),
    ])
  }, [refreshMembers, refreshChores, refreshCompletions, refreshLedger, refreshFamilyName])

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
      rewardAmount: number
      recurring: boolean
    }) => {
      const { error } = await supabase.from('chores').insert({
        family_id: familyId,
        title: input.title,
        description: input.description || null,
        assigned_to: input.assignedTo,
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
    actionableChores,
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
    refreshAll,
  }

  return <FamilyDataContext.Provider value={value}>{children}</FamilyDataContext.Provider>
}

export function useFamilyData() {
  const ctx = useContext(FamilyDataContext)
  if (!ctx) throw new Error('useFamilyData must be used within a FamilyDataProvider')
  return ctx
}
