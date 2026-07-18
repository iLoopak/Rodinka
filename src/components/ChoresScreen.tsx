import { useEffect, useMemo, useState } from 'react'
import { t } from '../strings'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../context/family/FamilyMembersContext'
import { useChoresData } from '../context/chores/ChoresContext'
import { useAllowanceData } from '../context/chores/AllowanceContext'
import { useChoreApprovalActions } from '../context/chores/useChoreApprovalActions'
import { ChoreList } from './ChoreList'
import { PendingApprovals } from './PendingApprovals'
import { AllowanceBalances } from './AllowanceBalances'
import { ErrorState } from './ui/ErrorState'
import { ChoreDetailModal } from './ChoreDetailModal'
import { useRouter } from '../router'
import { resolveDeepLinkedItem } from '../utils/deepLinks'
import type { Chore } from '../hooks/useChores'
import { getChoreState } from '../utils/choreState'
import { choreRecurrenceSummary } from '../utils/choreRecurrence'
import { formatFullDate } from '../utils/dueDate'
import { isQuickTodo } from '../utils/todayQuickAdd'
import { QuickTodoPriorityList } from './chores/QuickTodoPriorityList'
import { ScrollableTabs } from './ui/ScrollableTabs'
import { ScreenHeader } from './ui/ScreenHeader'
import { ArchivedItemBadge } from './ui/DestructiveActions'
import { capabilitiesFor } from '../utils/uiCapabilities'
import { useOccurrenceAssignmentsData } from '../context/activities/OccurrenceAssignmentsContext'
import { childVisibleChores } from '../utils/childChoreVisibility'
import { useCreateRecord } from '../context/create-record/CreateRecordContext'

type Tab = 'active' | 'pending' | 'allowance' | 'manage'

function initialTab(): Tab {
  const hash = window.location.hash.replace('#', '')
  if (hash === 'pending' || hash === 'allowance' || hash === 'manage') return hash
  return 'active'
}

export function ChoresScreen() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [selectedChore, setSelectedChore] = useState<Chore | null>(null)
  const [deepLinkError, setDeepLinkError] = useState(false)
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null)
  const { searchParams, setQueryParam, removeQueryParam } = useRouter()
  const { openCreateRecord } = useCreateRecord()
  const choreParam = searchParams.get('chore')
  const editParam = searchParams.get('edit') === '1'
  const { currentMember, isParentOrAdmin } = useFamilyCore()
  const capabilities = capabilitiesFor(currentMember)
  const { kids, members, memberById, membersLoading, membersError, refreshMembers } = useFamilyMembersData()
  const {
    chores,
    completions,
    pendingCompletions,
    latestCompletionFor,
    reject,
    updateChore,
    setChoreArchived,
    reorderQuickTodos,
    choresLoading,
    choresError,
    refreshChores,
    refreshCompletions,
  } = useChoresData()
  const { approve, markDone } = useChoreApprovalActions()
  const { occurrenceOverrides, assignmentHistory } = useOccurrenceAssignmentsData()
  const {
    balances,
    allowanceEntries,
    payout,
    allowancePlans,
    allowanceCycles,
    creditAllowance,
    skipAllowance,
    allowanceLoading,
    allowanceError,
    refreshLedger,
    refreshAllowancePlans,
  } = useAllowanceData()

  const visibleChores = useMemo(() => {
    if (!capabilities.isChild) return chores
    return childVisibleChores(currentMember.id, chores, occurrenceOverrides, assignmentHistory)
  }, [assignmentHistory, capabilities.isChild, chores, currentMember.id, occurrenceOverrides])

  const loading = membersLoading || choresLoading || allowanceLoading
  const error = membersError || choresError || allowanceError
  async function refreshAll() {
    await Promise.all([refreshMembers(), refreshChores(), refreshCompletions(), refreshLedger(), refreshAllowancePlans()])
  }

  useEffect(() => {
    if (loading) return
    const resolution = resolveDeepLinkedItem(visibleChores, choreParam)
    if (resolution.status === 'found') {
      setSelectedChore(resolution.item)
      if (resolution.item.status === 'archived') setTab('manage')
      setDeepLinkError(false)
    } else if (resolution.status === 'invalid' || resolution.status === 'not_found') {
      setSelectedChore(null)
      setDeepLinkError(true)
    } else {
      setSelectedChore(null)
      setDeepLinkError(false)
    }
  }, [choreParam, loading, visibleChores])

  if (loading) {
    return <p className="loading">{t.loading.generic}</p>
  }

  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />
  }

  async function handleApprove(completionId: string) {
    const result = await approve(completionId)
    setApprovalFeedback(result.nextDueDate
      ? t.chores.approvedNextDue(formatFullDate(result.nextDueDate))
      : t.chores.approvedOneOff)
    return result
  }

  function openChore(chore: Chore) {
    setSelectedChore(chore)
    setDeepLinkError(false)
    setQueryParam('chore', chore.id)
    if (editParam) removeQueryParam('edit')
  }

  function closeChore() {
    setSelectedChore(null)
    if (choreParam !== null) removeQueryParam('chore')
    if (editParam) removeQueryParam('edit')
  }

  function promoteQuickTodo(chore: Chore) {
    setSelectedChore(chore)
    setDeepLinkError(false)
    setQueryParam('chore', chore.id)
    setQueryParam('edit', '1', 'replace')
  }

  const adultTabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'active', label: t.chores.tabActive },
    { id: 'pending', label: t.chores.tabPending, count: pendingCompletions.length },
    { id: 'allowance', label: t.chores.tabAllowance },
    { id: 'manage', label: t.chores.tabManage },
  ]
  const tabs = capabilities.isChild
    ? adultTabs.filter((item) => item.id === 'active' || item.id === 'allowance')
    : adultTabs
  const visibleTab: Tab = capabilities.isChild && (tab === 'pending' || tab === 'manage') ? 'active' : tab
  const activeChores = visibleChores.filter((chore) => {
    const state = getChoreState(chore, latestCompletionFor(chore.id))
    return chore.status === 'active' && state !== 'done' && state !== 'archived'
  })
  const quickTodos = isParentOrAdmin ? activeChores.filter(isQuickTodo) : []
  const fullTasks = isParentOrAdmin ? activeChores.filter((chore) => !isQuickTodo(chore)) : activeChores

  return (
    <>
      <ScreenHeader title={capabilities.isChild ? t.nav.myTasks : t.nav.chores} actions={capabilities.manageTaskDefinitions ? (
          <button
            type="button"
            className="header-action-button"
            onClick={() => openCreateRecord({ type: 'household-task', source: 'chores' })}
          >
            <span aria-hidden="true">+</span> {t.chores.addChoreAction}
          </button>
        ) : undefined} />

      <ScrollableTabs tabs={tabs} activeTab={visibleTab} onChange={setTab} />

      {deepLinkError && <p className="error" role="alert">{t.deepLinks.notFound}</p>}
      {approvalFeedback && <p className="success approval-feedback" role="status">{approvalFeedback}</p>}

      {visibleTab === 'active' && (
        <>
        {quickTodos.length > 0 && <section className="page-section">
          <div className="quick-todo-priority-heading">
            <h2 className="section-heading">{t.chores.quickTasksTitle}</h2>
            <p>{t.chores.quickTasksBody}</p>
          </div>
          <div className="panel is-secondary is-tasks">
            <QuickTodoPriorityList
              tasks={quickTodos}
              onComplete={(taskId) => markDone(taskId)}
              onPromote={promoteQuickTodo}
              onReorder={reorderQuickTodos}
            />
          </div>
        </section>}
        <section className="page-section">
          {quickTodos.length > 0 && <h2 className="section-heading">{t.chores.fullTasksTitle}</h2>}
          <div className={`panel ${fullTasks.length === 0 ? 'is-quiet' : 'is-primary'}`}>
            <ChoreList
              chores={fullTasks}
              memberById={memberById}
              latestCompletionFor={latestCompletionFor}
              onMarkDone={markDone}
              onSelect={openChore}
            />
          </div>
        </section>
        </>
      )}

      {visibleTab === 'pending' && capabilities.approveTaskCompletions && (
        <section className="page-section">
          {pendingCompletions.length === 0 ? (
            <p className="empty-state">{t.chores.noPendingApprovals}</p>
          ) : (
            <div className="panel is-primary">
              <PendingApprovals
                completions={pendingCompletions}
                chores={chores}
                memberById={memberById}
                onApprove={handleApprove}
                onReject={reject}
              />
            </div>
          )}
        </section>
      )}

      {visibleTab === 'allowance' && (
        <section className="page-section">
          <div className="panel is-primary">
            <AllowanceBalances kids={capabilities.isChild ? kids.filter((kid) => kid.id === currentMember.id) : kids} balances={balances} onPayout={payout} chores={chores}
              completions={completions} plans={allowancePlans} cycles={allowanceCycles}
              entries={capabilities.isChild ? allowanceEntries.filter((entry) => entry.member_id === currentMember.id) : undefined}
              canManage={isParentOrAdmin} onCredit={creditAllowance} onSkip={skipAllowance} />
          </div>
        </section>
      )}

      {visibleTab === 'manage' && capabilities.manageTaskDefinitions && (
        <section className="page-section">
          <p className="home-subtitle">{t.chores.manageIntro}</p>
          {chores.length === 0 ? <p className="empty-state">{t.chores.managementEmpty}</p> : (
            <div className="panel is-primary">
              <ul className="section-list plain-list">
                {chores.map((chore) => <li key={chore.id}>
                  <span className="row-title">{chore.title}</span>
                  <span className="row-meta">{chore.assigned_to ? memberById(chore.assigned_to)?.display_name ?? '?' : t.chores.unassigned}</span>
                  <span className="row-description">{choreRecurrenceSummary(chore)}</span>
                  <span className="row-spacer" />
                  {chore.status === 'archived' && <ArchivedItemBadge>{t.chores.archivedBadge}</ArchivedItemBadge>}
                  <button type="button" className="btn-secondary" onClick={() => openChore(chore)}>{t.deepLinks.openDetail}</button>
                </li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {selectedChore && <ChoreDetailModal
        key={`${selectedChore.id}:${editParam ? 'edit' : 'detail'}`}
        chore={selectedChore}
        assignee={selectedChore.assigned_to ? memberById(selectedChore.assigned_to) : undefined}
        members={members}
        currentMemberId={currentMember.id}
        completions={completions.filter((completion) => completion.chore_id === selectedChore.id)}
        latestCompletion={latestCompletionFor(selectedChore.id)}
        canManage={isParentOrAdmin}
        initialEditing={editParam && isParentOrAdmin}
        onMarkDone={markDone}
        onUpdate={updateChore}
        onSetArchived={setChoreArchived}
        onClose={closeChore}
      />}
    </>
  )
}
