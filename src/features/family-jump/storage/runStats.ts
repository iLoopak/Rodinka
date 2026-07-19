import { FAMILY_JUMP_GAME_KEY } from '../config/gameConfig'
import type { StorageLike } from './records'

export interface FamilyJumpMemberRunStats {
  lastScore: number
  todayBest: number
  attempts: number
}

export type FamilyJumpRunStatsMap = Record<string, FamilyJumpMemberRunStats>

interface StoredMemberRunStats extends FamilyJumpMemberRunStats {
  todayKey: string
}

interface StoredFamilyJumpRunStats {
  version: 1
  familyId: string
  gameKey: typeof FAMILY_JUMP_GAME_KEY
  members: Record<string, StoredMemberRunStats>
  updatedAt: string
}

const memoryFallback = new Map<string, StoredFamilyJumpRunStats>()

function storageKey(familyId: string) {
  return `rodinka.family-jump.run-stats.v1.${familyId}`
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadFamilyJumpRunStats(
  familyId: string,
  storage: StorageLike | null = browserStorage(),
  now: Date = new Date(),
): FamilyJumpRunStatsMap {
  const key = storageKey(familyId)
  let document = memoryFallback.get(key) ?? null
  try {
    const raw = storage?.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredFamilyJumpRunStats>
      if (parsed.version === 1 && parsed.familyId === familyId && parsed.gameKey === FAMILY_JUMP_GAME_KEY) {
        document = parsed as StoredFamilyJumpRunStats
      }
    }
  } catch { /* Private browsing can deny access or contain malformed data. */ }
  return normalizeMembers(document?.members, localDateKey(now))
}

export function recordFamilyJumpRun(
  familyId: string,
  memberId: string,
  score: number,
  storage: StorageLike | null = browserStorage(),
  now: Date = new Date(),
): FamilyJumpRunStatsMap {
  const todayKey = localDateKey(now)
  const current = loadFamilyJumpRunStats(familyId, storage, now)
  const normalizedScore = normalizeScore(score)
  const previous = current[memberId] ?? { lastScore: 0, todayBest: 0, attempts: 0 }
  const next = {
    ...current,
    [memberId]: {
      lastScore: normalizedScore,
      todayBest: Math.max(previous.todayBest, normalizedScore),
      attempts: previous.attempts + 1,
    },
  }
  const members = Object.fromEntries(Object.entries(next).map(([id, stats]) => [id, { ...stats, todayKey }]))
  const document: StoredFamilyJumpRunStats = {
    version: 1,
    familyId,
    gameKey: FAMILY_JUMP_GAME_KEY,
    members,
    updatedAt: now.toISOString(),
  }
  const key = storageKey(familyId)
  memoryFallback.set(key, document)
  try { storage?.setItem(key, JSON.stringify(document)) } catch { /* Memory fallback remains available. */ }
  return next
}

function normalizeMembers(value: unknown, todayKey: string): FamilyJumpRunStatsMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: FamilyJumpRunStatsMap = {}
  for (const [memberId, candidate] of Object.entries(value)) {
    if (!memberId || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const entry = candidate as Partial<StoredMemberRunStats>
    result[memberId] = {
      lastScore: normalizeScore(entry.lastScore),
      todayBest: entry.todayKey === todayKey ? normalizeScore(entry.todayBest) : 0,
      attempts: normalizeCount(entry.attempts),
    }
  }
  return result
}

function normalizeScore(value: unknown) {
  return Math.max(0, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : 0))
}

function normalizeCount(value: unknown) {
  return Math.max(0, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : 0))
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
