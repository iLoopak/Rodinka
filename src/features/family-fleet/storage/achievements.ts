import { FAMILY_FLEET_ACHIEVEMENTS, type AchievementDefinition } from '../achievements'
import { cosmeticKey } from '../cosmetics'
import type { FamilyFleetRunResult, FamilyFleetRunStats } from '../types'
import type { FamilyFleetRecordMap } from './records'
import { unlockCosmetics } from './cosmetics'
type UnlockedMap=Record<string,string[]>
interface Stored{version:1; familyId:string; unlocked:UnlockedMap; updatedAt:string}
const PREFIX='rodinka.family-fleet.achievements.v1.'
function storage(){try{return window.localStorage}catch{return null}}
function loadDoc(familyId:string,s:Storage|null):Stored{if(!s)return {version:1,familyId,unlocked:{},updatedAt:''}; try{const p=JSON.parse(s.getItem(PREFIX+familyId)||'{}') as Partial<Stored>; return {version:1,familyId,unlocked:p.unlocked&&typeof p.unlocked==='object'?p.unlocked:{},updatedAt:p.updatedAt||''}}catch{return {version:1,familyId,unlocked:{},updatedAt:''}}}
function saveDoc(familyId:string,doc:Stored,s:Storage|null){if(s)s.setItem(PREFIX+familyId,JSON.stringify(doc))}
export function loadUnlockedAchievements(familyId:string,memberId:string,s:Storage|null=storage()):Set<string>{return new Set(loadDoc(familyId,s).unlocked[memberId]??[])}

export interface EvaluateAchievementsInput {
  familyId: string
  memberId: string
  runResult: FamilyFleetRunResult
  memberStats: FamilyFleetRunStats
  familyStats: Record<string, FamilyFleetRunStats>
  familyRecords: FamilyFleetRecordMap
}

// Called once per finished run (after the run itself was already recorded).
// Walks the catalog in order so meta achievements — placed last — see every
// achievement unlocked earlier in this same pass. Any reward cosmetics are
// unlocked as a side effect so the Hangar reflects them immediately.
export function evaluateFamilyFleetAchievements(input: EvaluateAchievementsInput, s: Storage | null = storage()): AchievementDefinition[] {
  const { familyId, memberId, runResult, memberStats, familyStats, familyRecords } = input
  const doc = loadDoc(familyId, s)
  const working = new Set(doc.unlocked[memberId] ?? [])
  const newlyUnlocked: AchievementDefinition[] = []
  const rewardKeys: string[] = []
  for (const achievement of FAMILY_FLEET_ACHIEVEMENTS) {
    if (working.has(achievement.id)) continue
    const unlocked = achievement.condition({ memberId, runResult, memberStats, familyStats, familyRecords, unlockedIds: working })
    if (!unlocked) continue
    working.add(achievement.id)
    newlyUnlocked.push(achievement)
    if (achievement.reward) rewardKeys.push(cosmeticKey(achievement.reward.category, achievement.reward.id))
  }
  if (newlyUnlocked.length > 0) {
    doc.unlocked[memberId] = [...working]
    doc.updatedAt = new Date().toISOString()
    saveDoc(familyId, doc, s)
    if (rewardKeys.length > 0) unlockCosmetics(familyId, memberId, rewardKeys, s)
  }
  return newlyUnlocked
}
