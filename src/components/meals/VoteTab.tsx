import { useEffect, useState } from 'react'
import { t } from '../../strings'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useMealsDataContext } from '../../context/meals/MealsContext'
import { EmptyState } from '../ui/EmptyState'
import { Modal } from '../ui/Modal'
import { CreateRoundForm } from './CreateRoundForm'
import { VoteRoundResults } from './VoteRoundResults'

interface WinnerRef {
  mealId: string | null
  title: string
}

interface Props {
  onAddWinnerToPlan?: (winner: WinnerRef) => void
  /** A meal picked via "Add to vote" from the library, to prefill a new round with. */
  prefillMealId?: string
  onPrefillConsumed?: () => void
}

export function VoteTab({ onAddWinnerToPlan, prefillMealId, onPrefillConsumed }: Props) {
  const { isParentOrAdmin } = useFamilyCore()
  const { members } = useFamilyMembersData()
  const { meals, voteRounds, createVoteRound, openRound, closeRound, castVote } = useMealsDataContext()
  const [showCreate, setShowCreate] = useState(false)

  const requestedRoundId = new URLSearchParams(window.location.search).get('round')
  const requestedRound = voteRounds.find((round) => round.id === requestedRoundId && round.status !== 'closed')
  const activeRound = requestedRound ?? voteRounds.find((round) => round.status === 'open') ?? voteRounds.find((round) => round.status === 'draft')
  const closedRounds = voteRounds.filter((round) => round.status === 'closed')

  // "Add to vote" from the meal library only opens a prefilled create-round
  // wizard when there's no round in progress yet — adding a candidate to an
  // already-in-progress round isn't supported in this phase.
  useEffect(() => {
    if (prefillMealId && !activeRound) {
      setShowCreate(true)
    }
  }, [prefillMealId, activeRound])

  function closeCreate() {
    setShowCreate(false)
    onPrefillConsumed?.()
  }

  async function handleCreate(input: Parameters<typeof createVoteRound>[0], openImmediately: boolean) {
    await createVoteRound(input, openImmediately)
    closeCreate()
  }

  return (
    <>
      {requestedRoundId && !requestedRound && <p className="error" role="alert">{t.deepLinks.notFound}</p>}
      {isParentOrAdmin && !activeRound && (
        <div className="tab-toolbar">
          <button type="button" className="header-action-button" onClick={() => setShowCreate(true)}>
            <span aria-hidden="true">+</span> {t.mealVoting.startVoteAction}
          </button>
        </div>
      )}

      {activeRound ? (
        <section className="page-section">
          <div className="panel is-primary">
            <VoteRoundResults
              round={activeRound}
              members={members}
              isParentOrAdmin={isParentOrAdmin}
              onVote={castVote}
              onOpenRound={openRound}
              onCloseRound={closeRound}
              onAddWinnerToPlan={onAddWinnerToPlan}
            />
          </div>
        </section>
      ) : (
        <section className="page-section">
          <EmptyState
            title={t.mealVoting.noOpenRound}
            action={isParentOrAdmin ? { label: t.mealVoting.startVoteAction, onClick: () => setShowCreate(true) } : undefined}
          />
        </section>
      )}

      {closedRounds.length > 0 && (
        <section className="page-section">
          <h2 className="section-heading">{t.mealVoting.pastRoundsTitle}</h2>
          <div className="panel is-primary">
            <ul className="section-list plain-list">
              {closedRounds.map((round) => (
                <li key={round.id}>
                  <details>
                    <summary>{round.title}</summary>
                    <VoteRoundResults
                      round={round}
                      members={members}
                      isParentOrAdmin={isParentOrAdmin}
                      onVote={castVote}
                      onAddWinnerToPlan={onAddWinnerToPlan}
                    />
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {showCreate && (
        <Modal title={t.mealVoting.createRoundTitle} onClose={closeCreate}>
          <CreateRoundForm meals={meals} initialMealId={prefillMealId} onSubmit={handleCreate} />
        </Modal>
      )}
    </>
  )
}
