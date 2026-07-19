import { mergeFamilyJumpRecords, updateBestScore, type FamilyJumpRecordMap } from './records'
import type { FamilyJumpRemote } from './familyJumpRemote'

export async function synchronizeFamilyJumpRecords({
  familyId,
  activeMemberIds,
  localRecords,
  remote,
  signal,
}: {
  familyId: string
  activeMemberIds: readonly string[]
  localRecords: FamilyJumpRecordMap
  remote: FamilyJumpRemote
  signal?: AbortSignal
}): Promise<FamilyJumpRecordMap> {
  const activeMembers = new Set(activeMemberIds)
  const remoteRecords = await remote.fetchRecords(familyId, signal)
  const pending = Object.entries(localRecords).filter(([memberId, score]) =>
    activeMembers.has(memberId) && score > (remoteRecords[memberId] ?? 0))

  const saved = await Promise.all(pending.map(async ([memberId, score]) => ({
    memberId,
    score: await remote.recordBestScore(familyId, memberId, score, signal),
  })))

  let merged = mergeFamilyJumpRecords(localRecords, remoteRecords)
  for (const record of saved) merged = updateBestScore(merged, record.memberId, record.score)
  return merged
}
