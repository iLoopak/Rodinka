import { FAMILY_JUMP_GAME_KEY } from '../config/gameConfig'
import { unlockedCosmeticsAt } from '../achievements/achievementService'
import { cosmeticByKey } from '../cosmetics/cosmeticDefinitions'
import type { EquippedCosmetics, FamilyJumpCosmeticSlot } from '../cosmetics/cosmeticTypes'
import type { StorageLike } from './records'

export interface FamilyJumpProgress {
  memberId: string
  totalHeightMeters: number
  unlockedCosmeticKeys: string[]
  equippedCosmetics: EquippedCosmetics
  processedRunIds: string[]
  updatedAt: string
}

interface StoredProgressDocument {
  version: 2
  familyId: string
  gameKey: typeof FAMILY_JUMP_GAME_KEY
  members: Record<string, FamilyJumpProgress>
  updatedAt: string
}

export interface CompletedProgressRun {
  progress: FamilyJumpProgress
  newlyUnlockedKeys: string[]
  counted: boolean
}

const memoryFallback = new Map<string, StoredProgressDocument>()
const MAX_PROCESSED_RUN_IDS = 200

function storageKey(familyId: string) {
  return `rodinka.family-jump.progress.v2.${familyId}`
}

function browserStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

function emptyProgress(memberId: string): FamilyJumpProgress {
  return { memberId, totalHeightMeters: 0, unlockedCosmeticKeys: [], equippedCosmetics: {}, processedRunIds: [], updatedAt: '' }
}

export function loadFamilyJumpProgress(familyId: string, storage: StorageLike | null = browserStorage()): Record<string, FamilyJumpProgress> {
  const key = storageKey(familyId)
  let candidate: unknown = memoryFallback.get(key)
  try {
    const raw = storage?.getItem(key)
    if (raw) candidate = JSON.parse(raw)
  } catch { /* Keep the in-memory fallback. */ }
  if (!candidate || typeof candidate !== 'object') return {}
  const document = candidate as Partial<StoredProgressDocument>
  if (document.version !== 2 || document.familyId !== familyId || document.gameKey !== FAMILY_JUMP_GAME_KEY) return {}
  return normalizeMembers(document.members)
}

export function getMemberJumpProgress(familyId: string, memberId: string, storage: StorageLike | null = browserStorage()) {
  return loadFamilyJumpProgress(familyId, storage)[memberId] ?? emptyProgress(memberId)
}

export function completeFamilyJumpRun(
  familyId: string,
  memberId: string,
  runId: string,
  heightMeters: number,
  storage: StorageLike | null = browserStorage(),
  now: Date = new Date(),
): CompletedProgressRun {
  const members = loadFamilyJumpProgress(familyId, storage)
  const previous = members[memberId] ?? emptyProgress(memberId)
  if (!runId || previous.processedRunIds.includes(runId)) return { progress: previous, newlyUnlockedKeys: [], counted: false }
  const totalHeightMeters = previous.totalHeightMeters + normalizeMeters(heightMeters)
  const eligibleKeys = unlockedCosmeticsAt(totalHeightMeters).map((item) => item.key)
  const newlyUnlockedKeys = eligibleKeys.filter((key) => !previous.unlockedCosmeticKeys.includes(key))
  const progress: FamilyJumpProgress = {
    ...previous,
    memberId,
    totalHeightMeters,
    unlockedCosmeticKeys: [...new Set([...previous.unlockedCosmeticKeys, ...eligibleKeys])],
    processedRunIds: [...previous.processedRunIds, runId].slice(-MAX_PROCESSED_RUN_IDS),
    updatedAt: now.toISOString(),
  }
  persist(familyId, { ...members, [memberId]: progress }, storage, now)
  return { progress, newlyUnlockedKeys, counted: true }
}

export function equipFamilyJumpCosmetic(familyId: string, memberId: string, key: string, storage: StorageLike | null = browserStorage(), now = new Date()) {
  const members = loadFamilyJumpProgress(familyId, storage)
  const previous = members[memberId] ?? emptyProgress(memberId)
  const definition = cosmeticByKey(key)
  if (!definition || !previous.unlockedCosmeticKeys.includes(key)) return previous
  const progress = { ...previous, equippedCosmetics: { ...previous.equippedCosmetics, [definition.slot]: key }, updatedAt: now.toISOString() }
  persist(familyId, { ...members, [memberId]: progress }, storage, now)
  return progress
}

export function unequipFamilyJumpCosmetic(familyId: string, memberId: string, slot: FamilyJumpCosmeticSlot, storage: StorageLike | null = browserStorage(), now = new Date()) {
  const members = loadFamilyJumpProgress(familyId, storage)
  const previous = members[memberId] ?? emptyProgress(memberId)
  const equippedCosmetics = { ...previous.equippedCosmetics }
  delete equippedCosmetics[slot]
  const progress = { ...previous, equippedCosmetics, updatedAt: now.toISOString() }
  persist(familyId, { ...members, [memberId]: progress }, storage, now)
  return progress
}

export function setFamilyJumpTotalForDebug(familyId: string, memberId: string, meters: number, storage: StorageLike | null = browserStorage(), now = new Date()) {
  const members = loadFamilyJumpProgress(familyId, storage)
  const previous = members[memberId] ?? emptyProgress(memberId)
  const totalHeightMeters = normalizeMeters(meters)
  const unlockedCosmeticKeys = unlockedCosmeticsAt(totalHeightMeters).map((item) => item.key)
  const equippedCosmetics = Object.fromEntries(Object.entries(previous.equippedCosmetics).filter(([, key]) => key && unlockedCosmeticKeys.includes(key))) as EquippedCosmetics
  const progress = { ...previous, totalHeightMeters, unlockedCosmeticKeys, equippedCosmetics, updatedAt: now.toISOString() }
  persist(familyId, { ...members, [memberId]: progress }, storage, now)
  return progress
}

export function unlockAllFamilyJumpCosmeticsForDebug(familyId: string, memberId: string, storage: StorageLike | null = browserStorage(), now = new Date()) {
  const max = unlockedCosmeticsAt(Number.MAX_SAFE_INTEGER).at(-1)?.unlockAtTotalMeters ?? 0
  return setFamilyJumpTotalForDebug(familyId, memberId, max, storage, now)
}

export function resetFamilyJumpProgressForDebug(familyId: string, memberId: string, storage: StorageLike | null = browserStorage(), now = new Date()) {
  const members = loadFamilyJumpProgress(familyId, storage)
  const progress = emptyProgress(memberId)
  persist(familyId, { ...members, [memberId]: progress }, storage, now)
  return progress
}

function persist(familyId: string, members: Record<string, FamilyJumpProgress>, storage: StorageLike | null, now: Date) {
  const document: StoredProgressDocument = { version: 2, familyId, gameKey: FAMILY_JUMP_GAME_KEY, members, updatedAt: now.toISOString() }
  const key = storageKey(familyId)
  memoryFallback.set(key, document)
  try { storage?.setItem(key, JSON.stringify(document)) } catch { /* Memory fallback remains available. */ }
}

function normalizeMembers(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, FamilyJumpProgress> = {}
  for (const [memberId, raw] of Object.entries(value)) {
    if (!memberId || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const entry = raw as Partial<FamilyJumpProgress>
    const unlockedCosmeticKeys = Array.isArray(entry.unlockedCosmeticKeys) ? entry.unlockedCosmeticKeys.filter((key): key is string => typeof key === 'string' && Boolean(cosmeticByKey(key))) : []
    const equippedCosmetics: EquippedCosmetics = {}
    for (const slot of ['head', 'face', 'neck', 'feet'] as const) {
      const key = entry.equippedCosmetics?.[slot]
      const definition = typeof key === 'string' ? cosmeticByKey(key) : undefined
      if (typeof key === 'string' && definition?.slot === slot && unlockedCosmeticKeys.includes(key)) equippedCosmetics[slot] = key
    }
    result[memberId] = {
      memberId,
      totalHeightMeters: normalizeMeters(entry.totalHeightMeters),
      unlockedCosmeticKeys,
      equippedCosmetics,
      processedRunIds: Array.isArray(entry.processedRunIds) ? entry.processedRunIds.filter((id): id is string => typeof id === 'string').slice(-MAX_PROCESSED_RUN_IDS) : [],
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    }
  }
  return result
}

function normalizeMeters(value: unknown) {
  return Math.max(0, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : 0))
}
