import type { FamilyMember } from '../../../hooks/useFamilyMembers'
import { FAMILY_JUMP_GAME_KEY } from '../config/gameConfig'

export type FamilyJumpRecordMap = Record<string, number>

interface StoredFamilyJumpRecords {
  version: 1
  familyId: string
  gameKey: typeof FAMILY_JUMP_GAME_KEY
  scores: FamilyJumpRecordMap
  updatedAt: string
}

export interface FamilyJumpLeaderboardEntry {
  member: FamilyMember
  score: number
  rank: number
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const memoryFallback = new Map<string, StoredFamilyJumpRecords>()

function storageKey(familyId: string) {
  return `rodinka.family-jump.records.v1.${familyId}`
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadFamilyJumpRecords(familyId: string, storage: StorageLike | null = browserStorage()): FamilyJumpRecordMap {
  const key = storageKey(familyId)
  let raw: string | null = null
  try { raw = storage?.getItem(key) ?? null } catch { /* Private browsing can deny access. */ }
  if (!raw) return { ...(memoryFallback.get(key)?.scores ?? {}) }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredFamilyJumpRecords>
    if (parsed.version !== 1 || parsed.familyId !== familyId || parsed.gameKey !== FAMILY_JUMP_GAME_KEY) return {}
    return sanitizeScores(parsed.scores)
  } catch {
    return {}
  }
}

export function updateBestScore(scores: FamilyJumpRecordMap, memberId: string, score: number): FamilyJumpRecordMap {
  const normalized = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0))
  if ((scores[memberId] ?? 0) >= normalized) return scores
  return { ...scores, [memberId]: normalized }
}

export function saveFamilyJumpBestScore(
  familyId: string,
  memberId: string,
  score: number,
  storage: StorageLike | null = browserStorage(),
): FamilyJumpRecordMap {
  const key = storageKey(familyId)
  const current = loadFamilyJumpRecords(familyId, storage)
  const next = updateBestScore(current, memberId, score)
  if (next === current) return current
  const document: StoredFamilyJumpRecords = {
    version: 1,
    familyId,
    gameKey: FAMILY_JUMP_GAME_KEY,
    scores: next,
    updatedAt: new Date().toISOString(),
  }
  memoryFallback.set(key, document)
  try { storage?.setItem(key, JSON.stringify(document)) } catch { /* Memory fallback remains available. */ }
  return next
}

export function sortFamilyJumpLeaderboard(
  members: readonly FamilyMember[],
  scores: FamilyJumpRecordMap,
): FamilyJumpLeaderboardEntry[] {
  const sorted = [...members].sort((left, right) => {
    const scoreDifference = (scores[right.id] ?? 0) - (scores[left.id] ?? 0)
    return scoreDifference || left.display_name.localeCompare(right.display_name, 'cs')
  })
  return sorted.map((member, index) => ({ member, score: scores[member.id] ?? 0, rank: index + 1 }))
}

function sanitizeScores(value: unknown): FamilyJumpRecordMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: FamilyJumpRecordMap = {}
  for (const [memberId, score] of Object.entries(value)) {
    if (!memberId || typeof score !== 'number' || !Number.isFinite(score) || score < 0) continue
    result[memberId] = Math.floor(score)
  }
  return result
}
