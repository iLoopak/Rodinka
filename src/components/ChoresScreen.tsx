import { useEffect, useState } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { ChoreList } from './ChoreList'
import { PendingApprovals } from './PendingApprovals'
import { AllowanceBalances } from './AllowanceBalances'
import { AddChoreForm } from './AddChoreForm'
import { ErrorState } from './ui/ErrorState'
import { Modal } from './ui/Modal'
import { ChoreDetailModal } from './ChoreDetailModal'
import { useRouter } from '../router'
import { resolveDeepLinkedItem } from '../utils/deepLinks'
import type { Chore } from '../hooks/useChores'

type Tab = 'active' | 'pending' | 'allowance' | 'manage'

function initialTab(): Tab {
  const hash = window.location.hash.replace('#', '')
  if (hash === 'pending' || hash === 'allowance' || hash === 'manage') return hash
  return 'active'
}

export function ChoresScreen() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [showAddChore, setShowAddChore] = useState(false)
  const [selectedChore, setSelectedChore] = useState<Chore | null>(null)
  const [deepLinkError, setDeepLinkError] = useState(false)
  const { searchParams, setQueryParam, removeQueryParam } = useRouter()
  const choreParam = searchParams.get('chore')
  const {
    chores,
    completions,
    kids,
    members,
    currentMember,
    pendingCompletions,
    balances,
    memberById,
    latestCompletionFor,
    markDone,
    approve,
    reject,
    payout,
    allowancePlans,
    allowanceCycles,
    saveAllowancePlan,
    creditAllowance,
    skipAllowance,
    addChore,
    isParentOrAdmin,
    loading,
    error,
    refreshAll,
  } = useFamilyData()

  useEffect(() => {
    if (loading) return
    const resolution = resolveDeepLinkedItem(chores, choreParam)
    if (resolution.status === 'found') {
      setSelectedChore(resolution.item)
      setDeepLinkError(false)
    } else if (resolution.status === 'invalid' || resolution.status === 'not_found') {
      setSelectedChore(null)
      setDeepLinkError(true)
    } else {
      setSelectedChore(null)
      setDeepLinkError(false)
    }
  }, [choreParam, chores, loading])

  if (loading) {
    return <p className="loading">{t.loading.generic}</p>
  }

  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />
  }

  async function handleAddChore(input: {
    title: string
    description: string
    assignedTo: string
    dueDate: string
    rewardAmount: number
    recurring: boolean
  }) {
    await addChore(input)
    setShowAddChore(false)
  }

  function openChore(chore: Chore) {
    setSelectedChore(chore)
    setDeepLinkError(false)
    setQueryParam('chore', chore.id)
  }

  function closeChore() {
    setSelectedChore(null)
    if (choreParam !== null) removeQueryParam('chore')
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'active', label: t.chores.tabActive },
    { id: 'pending', label: t.chores.tabPending, count: pendingCompletions.length },
    { id: 'allowance', label: t.chores.tabAllowance },
    { id: 'manage', label: t.chores.tabManage },
  ]

  return (
    <>
      <div className="screen-header">
        <h1 className="home-title">{t.nav.chores}</h1>
        {isParentOrAdmin && (
          <button
            type="button"
            className="header-action-button"
            onClick={() => setShowAddChore(true)}
          >
            <span aria-hidden="true">+</span> {t.chores.addChoreAction}
          </button>
        )}
      </div>

      <div className="tabs" role="tablist">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            role="tab"
            aria-selected={tab === tabItem.id}
            className={`tab-button${tab === tabItem.id ? ' active' : ''}`}
            onClick={() => setTab(tabItem.id)}
          >
            {tabItem.label}
            {!!tabItem.count && <span className="tab-count">{tabItem.count}</span>}
          </button>
        ))}
      </div>

      {deepLinkError && <p className="error" role="alert">{t.deepLinks.notFound}</p>}

      {tab === 'active' && (
        <section className="section">
          <ChoreList
            chores={chores}
            memberById={memberById}
            latestCompletionFor={latestCompletionFor}
            onMarkDone={markDone}
            onSelect={openChore}
          />
        </section>
      )}

      {tab === 'pending' && (
        <section className="section">
          {pendingCompletions.length === 0 ? (
            <p className="empty-state">{t.chores.noPendingApprovals}</p>
          ) : (
            <PendingApprovals
              completions={pendingCompletions}
              chores={chores}
              memberById={memberById}
              onApprove={approve}
              onReject={reject}
            />
          )}
        </section>
      )}

      {tab === 'allowance' && (
        <section className="section">
          <AllowanceBalances kids={kids} balances={balances} onPayout={payout} chores={chores}
            completions={completions} plans={allowancePlans} cycles={allowanceCycles}
            canManage={isParentOrAdmin} onSavePlan={saveAllowancePlan} onCredit={creditAllowance} onSkip={skipAllowance} />
        </section>
      )}

      {tab === 'manage' && (
        <section className="section">
          <p>{t.chores.manageIntro}</p>
        </section>
      )}

      {showAddChore && (
        <Modal title={t.chores.addTitle} onClose={() => setShowAddChore(false)}>
          <AddChoreForm members={members} currentMemberId={currentMember.id} onSubmit={handleAddChore} />
        </Modal>
      )}

      {selectedChore && <ChoreDetailModal
        chore={selectedChore}
        assignee={memberById(selectedChore.assigned_to)}
        latestCompletion={latestCompletionFor(selectedChore.id)}
        onMarkDone={markDone}
        onClose={closeChore}
      />}
    </>
  )
}
