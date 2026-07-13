import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

export type VoteRoundStatus = 'draft' | 'open' | 'closed'
export type VoteValue = -1 | 0 | 1

export interface MealVote {
  id: string
  candidate_id: string
  member_id: string
  value: VoteValue
  created_by: string
  created_at: string
  updated_at: string
}

export interface MealVoteCandidate {
  id: string
  round_id: string
  meal_id: string | null
  meal_title: string
  created_at: string
  votes: MealVote[]
}

export interface MealVoteRound {
  id: string
  family_id: string
  title: string
  description: string | null
  status: VoteRoundStatus
  deadline_at: string | null
  created_by: string
  created_at: string
  closed_at: string | null
  candidates: MealVoteCandidate[]
}

export function useMealVoteRounds(familyId: string | undefined) {
  const [voteRounds, setVoteRounds] = useState<MealVoteRound[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!familyId) {
      setVoteRounds([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('meal_vote_rounds')
      .select(
        'id, family_id, title, description, status, deadline_at, created_by, created_at, closed_at, candidates:meal_vote_candidates(id, round_id, meal_id, meal_title, created_at, votes:meal_votes(id, candidate_id, member_id, value, created_by, created_at, updated_at))'
      )
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to load meal vote rounds:', error.message)
      setVoteRounds([])
      setError(t.errors.loadFailed)
    } else {
      setVoteRounds(data as unknown as MealVoteRound[])
      setError(null)
    }
    setLoading(false)
  }, [familyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { voteRounds, loading, error, refresh }
}
