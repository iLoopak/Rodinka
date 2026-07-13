import { describe, expect, it } from 'vitest'
import {
  canVoteInRound,
  getMemberVote,
  getMembersWithNoRoundVotes,
  getUnvotedMembers,
  rankCandidates,
  tallyVotes,
  topRankedCandidates,
} from './mealVoting'
import { makeMealVote, makeMealVoteCandidate } from './testFixtures'

describe('tallyVotes', () => {
  it('counts likes, dislikes, and neutral, and computes score as likes minus dislikes', () => {
    const votes = [
      makeMealVote({ value: 1 }),
      makeMealVote({ value: 1 }),
      makeMealVote({ value: -1 }),
      makeMealVote({ value: 0 }),
    ]
    expect(tallyVotes(votes)).toEqual({ likes: 2, dislikes: 1, neutral: 1, score: 1 })
  })

  it('returns all zeros for no votes', () => {
    expect(tallyVotes([])).toEqual({ likes: 0, dislikes: 0, neutral: 0, score: 0 })
  })
})

describe('getMemberVote / getUnvotedMembers', () => {
  const votes = [makeMealVote({ member_id: 'm1', value: 1 }), makeMealVote({ member_id: 'm2', value: -1 })]
  const members = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]

  it('finds a specific member vote', () => {
    expect(getMemberVote(votes, 'm1')?.value).toBe(1)
    expect(getMemberVote(votes, 'm3')).toBeNull()
  })

  it('lists members who have not voted', () => {
    expect(getUnvotedMembers(votes, members)).toEqual([{ id: 'm3' }])
  })
})

describe('rankCandidates', () => {
  it('ranks by score descending', () => {
    const candidates = [
      makeMealVoteCandidate({ id: 'a', meal_title: 'A', votes: [makeMealVote({ value: 1 })] }),
      makeMealVoteCandidate({ id: 'b', meal_title: 'B', votes: [makeMealVote({ value: 1 }), makeMealVote({ value: 1, member_id: 'm2' })] }),
      makeMealVoteCandidate({ id: 'c', meal_title: 'C', votes: [makeMealVote({ value: -1 })] }),
    ]
    const ranked = rankCandidates(candidates)
    expect(ranked.map((r) => r.candidate.id)).toEqual(['b', 'a', 'c'])
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('breaks ties by earlier creation time, then by title', () => {
    const candidates = [
      makeMealVoteCandidate({ id: 'later', meal_title: 'Z meal', created_at: '2026-07-02T00:00:00Z', votes: [] }),
      makeMealVoteCandidate({ id: 'earlier', meal_title: 'A meal', created_at: '2026-07-01T00:00:00Z', votes: [] }),
    ]
    const ranked = rankCandidates(candidates)
    expect(ranked.map((r) => r.candidate.id)).toEqual(['earlier', 'later'])
    // Tied score means the same rank for both.
    expect(ranked.map((r) => r.rank)).toEqual([1, 1])
  })

  it('gives tied candidates the same rank and does not skip ranks incorrectly', () => {
    const candidates = [
      makeMealVoteCandidate({ id: 'a', meal_title: 'A', created_at: '2026-07-01T00:00:00Z', votes: [makeMealVote({ value: 1 })] }),
      makeMealVoteCandidate({ id: 'b', meal_title: 'B', created_at: '2026-07-01T00:00:00Z', votes: [makeMealVote({ value: 1 })] }),
      makeMealVoteCandidate({ id: 'c', meal_title: 'C', votes: [] }),
    ]
    const ranked = rankCandidates(candidates)
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3])
  })

  it('produces a stable order across repeated calls on the same data', () => {
    const candidates = [
      makeMealVoteCandidate({ id: 'a', meal_title: 'A', votes: [makeMealVote({ value: 1 })] }),
      makeMealVoteCandidate({ id: 'b', meal_title: 'B', votes: [makeMealVote({ value: -1 })] }),
    ]
    const first = rankCandidates(candidates).map((r) => r.candidate.id)
    const second = rankCandidates(candidates).map((r) => r.candidate.id)
    expect(first).toEqual(second)
  })
})

describe('topRankedCandidates', () => {
  it('returns only the rank-1 candidates, including ties', () => {
    const candidates = [
      makeMealVoteCandidate({ id: 'a', meal_title: 'A', votes: [makeMealVote({ value: 1 })] }),
      makeMealVoteCandidate({ id: 'b', meal_title: 'B', votes: [makeMealVote({ value: 1 })] }),
      makeMealVoteCandidate({ id: 'c', meal_title: 'C', votes: [] }),
    ]
    const winners = topRankedCandidates(rankCandidates(candidates))
    expect(winners.map((w) => w.candidate.id).sort()).toEqual(['a', 'b'])
  })

  it('returns an empty array for no candidates', () => {
    expect(topRankedCandidates(rankCandidates([]))).toEqual([])
  })
})

describe('getMembersWithNoRoundVotes', () => {
  it('only excludes members who voted on at least one candidate in the round', () => {
    const members = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]
    const candidates = [
      makeMealVoteCandidate({
        id: 'a',
        votes: [makeMealVote({ member_id: 'm1', value: 1 })],
      }),
      makeMealVoteCandidate({
        id: 'b',
        votes: [makeMealVote({ member_id: 'm2', value: -1 })],
      }),
    ]
    expect(getMembersWithNoRoundVotes(candidates, members)).toEqual([{ id: 'm3' }])
  })

  it('returns everyone when there are no candidates or votes', () => {
    const members = [{ id: 'm1' }, { id: 'm2' }]
    expect(getMembersWithNoRoundVotes([], members)).toEqual(members)
  })
})

describe('canVoteInRound', () => {
  it('only allows voting while the round is open', () => {
    expect(canVoteInRound('draft')).toBe(false)
    expect(canVoteInRound('open')).toBe(true)
    expect(canVoteInRound('closed')).toBe(false)
  })
})
