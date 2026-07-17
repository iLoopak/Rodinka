import { useState } from 'react'
import { t } from '../../strings'
import { voteRoundStatusLabel } from '../../utils/mealLabels'
import {
  canVoteInRound,
  getMemberVote,
  getMembersWithNoRoundVotes,
  rankCandidates,
} from '../../utils/mealVoting'
import { MemberAvatar } from '../ui/MemberAvatar'
import type { MealVoteRound, VoteValue } from '../../hooks/useMealVoteRounds'
import type { FamilyMember } from '../../hooks/useFamilyMembers'

interface WinnerRef {
  mealId: string | null
  title: string
}

interface Props {
  round: MealVoteRound
  members: FamilyMember[]
  isParentOrAdmin: boolean
  onVote: (candidateId: string, memberId: string, value: VoteValue) => Promise<void>
  onOpenRound?: (roundId: string) => Promise<void>
  onCloseRound?: (roundId: string) => Promise<void>
  onAddWinnerToPlan?: (winner: WinnerRef) => void
}

export function VoteRoundResults({ round, members, isParentOrAdmin, onVote, onOpenRound, onCloseRound, onAddWinnerToPlan }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState(false)

  const ranked = rankCandidates(round.candidates)
  const unvotedMembers = getMembersWithNoRoundVotes(round.candidates, members)
  const canVote = canVoteInRound(round.status)
  const winnerCount = ranked.filter((entry) => entry.rank === 1).length

  async function handleVote(candidateId: string, memberId: string, value: VoteValue) {
    const key = `${candidateId}:${memberId}`
    setBusyKey(key)
    setError(null)
    try {
      await onVote(candidateId, memberId, value)
    } catch (err) {
      console.error('Failed to update meal vote:', err)
      setError(t.errors.generic)
    } finally {
      setBusyKey(null)
    }
  }

  async function handleOpen() {
    if (!onOpenRound) return
    setTransitioning(true)
    setError(null)
    try {
      await onOpenRound(round.id)
    } catch (err) {
      console.error('Failed to open meal vote:', err)
      setError(t.errors.generic)
    } finally {
      setTransitioning(false)
    }
  }

  async function handleClose() {
    if (!onCloseRound) return
    setTransitioning(true)
    setError(null)
    try {
      await onCloseRound(round.id)
    } catch (err) {
      console.error('Failed to close meal vote:', err)
      setError(t.errors.generic)
    } finally {
      setTransitioning(false)
    }
  }

  const statusBadgeClass =
    round.status === 'open' ? 'badge-today' : round.status === 'closed' ? 'badge-done' : 'badge-pending'

  return (
    <div className="vote-round">
      <div className="vote-round-header">
        <h3>{round.title}</h3>
        <span className={`badge ${statusBadgeClass}`}>{voteRoundStatusLabel(round.status)}</span>
      </div>
      {round.description && <p className="row-description">{round.description}</p>}

      {round.status === 'draft' && isParentOrAdmin && (
        <button onClick={handleOpen} disabled={transitioning || round.candidates.length === 0}>
          {transitioning ? t.mealVoting.submitting : t.mealVoting.openRoundAction}
        </button>
      )}
      {round.status === 'draft' && round.candidates.length === 0 && (
        <p className="empty-state">{t.mealVoting.draftNeedsCandidates}</p>
      )}
      {round.status === 'open' && isParentOrAdmin && (
        <button className="btn-secondary" onClick={handleClose} disabled={transitioning}>
          {transitioning ? t.mealVoting.submitting : t.mealVoting.closeRoundAction}
        </button>
      )}

      {round.candidates.length === 0 ? (
        <p className="empty-state">{t.mealVoting.candidatesEmpty}</p>
      ) : (
        <ul className="vote-candidate-list">
          {ranked.map(({ candidate, tally, rank }) => (
            <li key={candidate.id} className="vote-candidate-card">
              <div className="vote-candidate-header">
                <span className="row-title">{candidate.meal_title}</span>
                {round.status === 'closed' && rank === 1 && (
                  <span className="badge badge-done">{winnerCount > 1 ? t.mealVoting.tieBadge : t.mealVoting.winnerBadge}</span>
                )}
                <span className="row-spacer" />
                <span className="row-meta">
                  {t.mealVoting.likesLabel}: {tally.likes} · {t.mealVoting.dislikesLabel}: {tally.dislikes}
                </span>
              </div>

              {members.map((member) => {
                const memberVote = getMemberVote(candidate.votes, member.id)
                const key = `${candidate.id}:${member.id}`
                return (
                  <div key={member.id} className="vote-member-row">
                    <MemberAvatar member={member} size={22} />
                    <span className="row-meta">{member.display_name}</span>
                    <span className="row-spacer" />
                    <div className="vote-buttons" role="group" aria-label={t.mealVoting.votingAsLabel(member.display_name)}>
                      <button
                        type="button"
                        className={`vote-button vote-like${memberVote?.value === 1 ? ' active' : ''}`}
                        aria-pressed={memberVote?.value === 1}
                        disabled={!canVote || busyKey === key}
                        onClick={() => handleVote(candidate.id, member.id, 1)}
                      >
                        {t.mealVoting.voteLike}
                      </button>
                      <button
                        type="button"
                        className={`vote-button vote-neutral${memberVote?.value === 0 ? ' active' : ''}`}
                        aria-pressed={memberVote?.value === 0}
                        disabled={!canVote || busyKey === key}
                        onClick={() => handleVote(candidate.id, member.id, 0)}
                      >
                        {t.mealVoting.voteNeutral}
                      </button>
                      <button
                        type="button"
                        className={`vote-button vote-dislike${memberVote?.value === -1 ? ' active' : ''}`}
                        aria-pressed={memberVote?.value === -1}
                        disabled={!canVote || busyKey === key}
                        onClick={() => handleVote(candidate.id, member.id, -1)}
                      >
                        {t.mealVoting.voteDislike}
                      </button>
                    </div>
                  </div>
                )
              })}

              {round.status === 'closed' && rank === 1 && isParentOrAdmin && onAddWinnerToPlan && (
                <button
                  className="btn-secondary"
                  onClick={() => onAddWinnerToPlan({ mealId: candidate.meal_id, title: candidate.meal_title })}
                >
                  {t.mealVoting.addWinnersToPlanAction}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {round.status === 'open' && round.candidates.length > 0 && (
        <>
          {unvotedMembers.length === members.length ? (
            <p className="row-meta">{t.mealVoting.noVotesYet}</p>
          ) : unvotedMembers.length === 0 ? (
            <p className="row-meta">{t.mealVoting.allVoted}</p>
          ) : (
            <ul className="section-list plain-list">
              {unvotedMembers.map((member) => (
                <li key={member.id}>
                  <span className="row-meta">{t.mealVoting.notVotedYetLabel(member.display_name)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
