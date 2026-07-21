import { useEffect } from 'react'
import { t } from '../../strings'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useMealsDataContext } from '../../context/meals/MealsContext'
import { EmptyState } from '../ui/EmptyState'
import { VoteRoundResults } from './VoteRoundResults'
import { capabilitiesFor } from '../../utils/uiCapabilities'
import { useCreateRecord } from '../../context/create-record/CreateRecordContext'
import { AppToolbarAddButton } from '../ui/AddAction'

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
  const { currentMember, isParentOrAdmin } = useFamilyCore()
  const capabilities = capabilitiesFor(currentMember)
  const { members } = useFamilyMembersData()
  const votingMembers = members.filter(capabilities.voteFor)
  const { voteRounds, openRound, closeRound, castVote } = useMealsDataContext()
  const { openCreateRecord } = useCreateRecord()

  const requestedRoundId = new URLSearchParams(window.location.search).get('round')
  const requestedRound = voteRounds.find((round) => round.id === requestedRoundId && round.status !== 'closed')
  const activeRound = requestedRound ?? voteRounds.find((round) => round.status === 'open') ?? voteRounds.find((round) => round.status === 'draft')
  const closedRounds = voteRounds.filter((round) => round.status === 'closed')

  // "Add to vote" from the meal library only opens a prefilled create-round
  // wizard when there's no round in progress yet — adding a candidate to an
  // already-in-progress round isn't supported in this phase.
  useEffect(() => {
    if (prefillMealId && !activeRound) {
      openCreateRecord({ type: 'meal-vote', mealId: prefillMealId, source: 'meal-library' })
      onPrefillConsumed?.()
    }
  }, [prefillMealId, activeRound, onPrefillConsumed, openCreateRecord])

  return (
    <>
      {requestedRoundId && !requestedRound && <p className="error" role="alert">{t.deepLinks.notFound}</p>}
      {isParentOrAdmin && !activeRound && (
        <div className="tab-toolbar">
          <AppToolbarAddButton onClick={() => openCreateRecord({ type: 'meal-vote', source: 'meal-vote' })}>{t.mealVoting.startVoteAction}</AppToolbarAddButton>
        </div>
      )}

      {activeRound ? (
        <section className="page-section">
          <div className="panel is-primary">
            <VoteRoundResults
              round={activeRound}
              members={votingMembers}
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
            action={isParentOrAdmin ? { label: t.mealVoting.startVoteAction, onClick: () => openCreateRecord({ type: 'meal-vote', source: 'meal-vote-empty' }), variant: 'primary' } : undefined}
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
                      members={votingMembers}
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

    </>
  )
}
