import { supabase } from '../../../supabaseClient'
import { FAMILY_JUMP_GAME_KEY } from '../config/gameConfig'
import type { FamilyJumpRecordMap } from './records'

interface FamilyGameScoreRow {
  member_id: string
  best_score: number
}

export interface FamilyJumpRemote {
  fetchRecords(familyId: string, signal?: AbortSignal): Promise<FamilyJumpRecordMap>
  recordBestScore(familyId: string, memberId: string, score: number, signal?: AbortSignal): Promise<number>
}

export class SupabaseFamilyJumpRemote implements FamilyJumpRemote {
  async fetchRecords(familyId: string, signal?: AbortSignal): Promise<FamilyJumpRecordMap> {
    let query = supabase
      .from('family_game_scores')
      .select('member_id, best_score')
      .eq('family_id', familyId)
      .eq('game_key', FAMILY_JUMP_GAME_KEY)
      .order('best_score', { ascending: false })
      .limit(500)
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (error) throw error
    return recordsFromRows((data ?? []) as FamilyGameScoreRow[])
  }

  async recordBestScore(familyId: string, memberId: string, score: number, signal?: AbortSignal): Promise<number> {
    let request = supabase.rpc('record_family_game_score', {
      p_family_id: familyId,
      p_member_id: memberId,
      p_game_key: FAMILY_JUMP_GAME_KEY,
      p_score: Math.max(0, Math.floor(score)),
    })
    if (signal) request = request.abortSignal(signal)
    const { data, error } = await request
    if (error) throw error
    const savedScore = Number(data)
    if (!Number.isFinite(savedScore) || savedScore < 0) throw new Error('Invalid Family Jump score response')
    return Math.floor(savedScore)
  }
}

export function recordsFromRows(rows: readonly FamilyGameScoreRow[]): FamilyJumpRecordMap {
  const records: FamilyJumpRecordMap = {}
  for (const row of rows) {
    const score = Number(row.best_score)
    if (!row.member_id || !Number.isFinite(score) || score < 0) continue
    records[row.member_id] = Math.max(records[row.member_id] ?? 0, Math.floor(score))
  }
  return records
}
