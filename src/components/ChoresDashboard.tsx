import { useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useChores } from '../hooks/useChores'
import { useChoreCompletions } from '../hooks/useChoreCompletions'
import { useAllowanceLedger } from '../hooks/useAllowanceLedger'
import { AddChildForm } from './AddChildForm'
import { AddChoreForm } from './AddChoreForm'
import { ChoreList } from './ChoreList'
import { PendingApprovals } from './PendingApprovals'
import { AllowanceBalances } from './AllowanceBalances'

interface Props {
  familyId: string
  userId: string
}

export function ChoresDashboard({ familyId, userId }: Props) {
  const { members, loading: membersLoading, refresh: refreshMembers } = useFamilyMembers(familyId)
  const { chores, loading: choresLoading, refresh: refreshChores } = useChores(familyId)
  const {
    completions,
    loading: completionsLoading,
    refresh: refreshCompletions,
  } = useChoreCompletions(familyId)
  const { entries, loading: ledgerLoading, refresh: refreshLedger } = useAllowanceLedger(familyId)

  const kids = useMemo(() => members.filter((m) => m.role === 'child'), [members])

  const memberName = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m.display_name]))
    return (id: string) => byId.get(id) ?? '?'
  }, [members])

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

  function latestCompletionFor(choreId: string) {
    // `completions` is ordered newest-first by the hook, so the first match is the latest.
    return completions.find((c) => c.chore_id === choreId) ?? null
  }

  async function handleAddChore(input: {
    title: string
    description: string
    assignedTo: string
    rewardAmount: number
    recurring: boolean
  }) {
    const { error } = await supabase.from('chores').insert({
      family_id: familyId,
      title: input.title,
      description: input.description || null,
      assigned_to: input.assignedTo,
      reward_amount: input.rewardAmount,
      recurring: input.recurring,
      created_by: userId,
    })
    if (error) throw new Error(error.message)
    await refreshChores()
  }

  async function handleMarkDone(choreId: string, assignedTo: string) {
    const { error } = await supabase
      .from('chore_completions')
      .insert({ chore_id: choreId, completed_by: assignedTo })
    if (error) throw new Error(error.message)
    await refreshCompletions()
  }

  async function handleApprove(completionId: string) {
    const { error } = await supabase.rpc('approve_chore_completion', { completion_id: completionId })
    if (error) throw new Error(error.message)
    await Promise.all([refreshCompletions(), refreshLedger()])
  }

  async function handleReject(completionId: string) {
    const { error } = await supabase.rpc('reject_chore_completion', { completion_id: completionId })
    if (error) throw new Error(error.message)
    await refreshCompletions()
  }

  async function handlePayout(memberId: string, amount: number, reason: string) {
    const { error } = await supabase.rpc('record_payout', {
      target_member_id: memberId,
      payout_amount: amount,
      payout_reason: reason || null,
    })
    if (error) throw new Error(error.message)
    await refreshLedger()
  }

  if (membersLoading || choresLoading || completionsLoading || ledgerLoading) {
    return <p className="loading">{t.loading.family}</p>
  }

  return (
    <>
      {pendingCompletions.length > 0 && (
        <section className="section accent-coral">
          <h2>{t.home.needsAttention}</h2>
          <PendingApprovals
            completions={pendingCompletions}
            chores={chores}
            memberName={memberName}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </section>
      )}

      <section className="section accent-sage">
        <h2>{t.home.thisWeek}</h2>
        <ChoreList
          chores={chores}
          memberName={memberName}
          latestCompletionFor={latestCompletionFor}
          onMarkDone={handleMarkDone}
        />
      </section>

      <section className="section accent-lavender">
        <h2>{t.home.howWeAreDoing}</h2>
        <AllowanceBalances kids={kids} balances={balances} onPayout={handlePayout} />
      </section>

      <details className="manage">
        <summary>{t.home.manage}</summary>
        <AddChildForm familyId={familyId} onAdded={refreshMembers} />
        <AddChoreForm kids={kids} onSubmit={handleAddChore} />
      </details>
    </>
  )
}
