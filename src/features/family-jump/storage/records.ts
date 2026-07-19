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

export interface StorageLike {
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
  const fallback = memoryFallback.get(key)?.scores ?? {}
  let raw: string | null = null
  try { raw = storage?.getItem(key) ?? null } catch { /* Private browsing can deny access. */ }
  if (!raw) return { ...fallback }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredFamilyJumpRecords>
    if (parsed.version !== 1 || parsed.familyId !== familyId || parsed.gameKey !== FAMILY_JUMP_GAME_KEY) return { ...fallback }
    return mergeFamilyJumpRecords(sanitizeScores(parsed.scores), fallback)
  } catch {
    return { ...fallback }
  }
}

export function mergeFamilyJumpRecords(...sources: readonly FamilyJumpRecordMap[]): FamilyJumpRecordMap {
  const merged: FamilyJumpRecordMap = {}
  for (const source of sources) {
    for (const [memberId, score] of Object.entries(sanitizeScores(source))) {
      if (score > (merged[memberId] ?? 0)) merged[memberId] = score
    }
  }
  return merged
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
  const current = loadFamilyJumpRecords(familyId, storage)
  const next = updateBestScore(current, memberId, score)
  if (next === current) return current
  return persistFamilyJumpRecords(familyId, next, storage)
}

export function saveFamilyJumpRecords(
  familyId: string,
  scores: FamilyJumpRecordMap,
  storage: StorageLike | null = browserStorage(),
): FamilyJumpRecordMap {
  const current = loadFamilyJumpRecords(familyId, storage)
  const next = mergeFamilyJumpRecords(current, scores)
  if (sameRecords(current, next)) return current
  return persistFamilyJumpRecords(familyId, next, storage)
}

function persistFamilyJumpRecords(familyId: string, scores: FamilyJumpRecordMap, storage: StorageLike | null) {
  const key = storageKey(familyId)
  const document: StoredFamilyJumpRecords = {
    version: 1,
    familyId,
    gameKey: FAMILY_JUMP_GAME_KEY,
    scores,
    updatedAt: new Date().toISOString(),
  }
  memoryFallback.set(key, document)
  try { storage?.setItem(key, JSON.stringify(document)) } catch { /* Memory fallback remains available. */ }
  return scores
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

function sameRecords(left: FamilyJumpRecordMap, right: FamilyJumpRecordMap) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) if ((left[key] ?? 0) !== (right[key] ?? 0)) return false
  return true
}
