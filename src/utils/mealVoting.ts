import type { MealVoteCandidate, MealVote, VoteRoundStatus } from '../hooks/useMealVoteRounds'

export interface VoteTally {
  likes: number
  dislikes: number
  neutral: number
  /** likes − dislikes; the basis for ranking. */
  score: number
}

export function tallyVotes(votes: MealVote[]): VoteTally {
  let likes = 0
  let dislikes = 0
  let neutral = 0
  for (const vote of votes) {
    if (vote.value === 1) likes++
    else if (vote.value === -1) dislikes++
    else neutral++
  }
  return { likes, dislikes, neutral, score: likes - dislikes }
}

export function getMemberVote(votes: MealVote[], memberId: string): MealVote | null {
  return votes.find((vote) => vote.member_id === memberId) ?? null
}

export function getUnvotedMembers<T extends { id: string }>(votes: MealVote[], members: T[]): T[] {
  const votedMemberIds = new Set(votes.map((vote) => vote.member_id))
  return members.filter((member) => !votedMemberIds.has(member.id))
}

export interface RankedCandidate {
  candidate: MealVoteCandidate
  tally: VoteTally
  /** 1-based; tied candidates share the same rank (no gaps skipped beyond ties). */
  rank: number
}

// Deterministic ranking: highest score (likes − dislikes) first. Ties are
// broken by earlier candidate creation time, then alphabetically by the
// snapshotted meal title — so the order never changes between renders
// for the same underlying vote data, and never depends on array
// insertion order from the database.
export function rankCandidates(candidates: MealVoteCandidate[]): RankedCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    const scoreA = tallyVotes(a.votes).score
    const scoreB = tallyVotes(b.votes).score
    if (scoreA !== scoreB) return scoreB - scoreA
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    return a.meal_title.localeCompare(b.meal_title)
  })

  const ranked: RankedCandidate[] = []
  let rank = 0
  let previousScore: number | null = null
  for (const candidate of sorted) {
    const tally = tallyVotes(candidate.votes)
    if (previousScore === null || tally.score !== previousScore) {
      rank = ranked.length + 1
      previousScore = tally.score
    }
    ranked.push({ candidate, tally, rank })
  }
  return ranked
}

export function topRankedCandidates(ranked: RankedCandidate[]): RankedCandidate[] {
  if (ranked.length === 0) return []
  return ranked.filter((entry) => entry.rank === 1)
}

export function canVoteInRound(roundStatus: VoteRoundStatus): boolean {
  return roundStatus === 'open'
}

// Members who haven't cast a single vote on any candidate in the round
// yet (as opposed to `getUnvotedMembers`, which checks a single
// candidate's vote list).
export function getMembersWithNoRoundVotes<T extends { id: string }>(
  candidates: MealVoteCandidate[],
  members: T[]
): T[] {
  const votedMemberIds = new Set(candidates.flatMap((candidate) => candidate.votes.map((vote) => vote.member_id)))
  return members.filter((member) => !votedMemberIds.has(member.id))
}
