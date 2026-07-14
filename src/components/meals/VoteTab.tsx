import { useEffect, useState } from 'react'
import { t } from '../../strings'
import { useFamilyData } from '../../context/FamilyDataContext'
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
  const { meals, voteRounds, members, isParentOrAdmin, createVoteRound, openRound, closeRound, castVote } =
    useFamilyData()
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
        <section className="section">
          <VoteRoundResults
            round={activeRound}
            members={members}
            isParentOrAdmin={isParentOrAdmin}
            onVote={castVote}
            onOpenRound={openRound}
            onCloseRound={closeRound}
            onAddWinnerToPlan={onAddWinnerToPlan}
          />
        </section>
      ) : (
        <section className="section">
          <EmptyState
            title={t.mealVoting.noOpenRound}
            action={isParentOrAdmin ? { label: t.mealVoting.startVoteAction, onClick: () => setShowCreate(true) } : undefined}
          />
        </section>
      )}

      {closedRounds.length > 0 && (
        <section className="section">
          <h2>{t.mealVoting.pastRoundsTitle}</h2>
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
