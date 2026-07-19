import { useCallback, useEffect, useMemo, useState } from 'react'
import { isNetworkUnavailableError } from '../../../network/networkStatus'
import { useNetworkStatus } from '../../../network/useNetworkStatus'
import { SupabaseFamilyJumpRemote } from '../storage/familyJumpRemote'
import {
  loadFamilyJumpRecords,
  saveFamilyJumpBestScore,
  saveFamilyJumpRecords,
  type FamilyJumpRecordMap,
} from '../storage/records'
import { synchronizeFamilyJumpRecords } from '../storage/syncRecords'

export type FamilyJumpSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

export function useFamilyJumpRecords(familyId: string, memberIds: readonly string[], syncEnabled: boolean) {
  const networkStatus = useNetworkStatus()
  const remote = useMemo(() => new SupabaseFamilyJumpRemote(), [])
  const memberIdsKey = useMemo(() => [...new Set(memberIds)].sort().join('|'), [memberIds])
  const activeMemberIds = useMemo(() => memberIdsKey ? memberIdsKey.split('|') : [], [memberIdsKey])
  const [records, setRecords] = useState<FamilyJumpRecordMap>(() => loadFamilyJumpRecords(familyId))
  const [syncStatus, setSyncStatus] = useState<FamilyJumpSyncStatus>(
    () => networkStatus === 'offline' ? 'offline' : 'idle',
  )

  useEffect(() => {
    setRecords(loadFamilyJumpRecords(familyId))
    setSyncStatus(networkStatus === 'offline' ? 'offline' : 'idle')
  }, [familyId, networkStatus])

  useEffect(() => {
    if (!syncEnabled) return
    if (networkStatus === 'offline') {
      setSyncStatus('offline')
      return
    }
    const controller = new AbortController()
    setSyncStatus('syncing')
    void synchronizeFamilyJumpRecords({
      familyId,
      activeMemberIds,
      localRecords: loadFamilyJumpRecords(familyId),
      remote,
      signal: controller.signal,
    }).then((merged) => {
      if (controller.signal.aborted) return
      setRecords(saveFamilyJumpRecords(familyId, merged))
      setSyncStatus('synced')
    }).catch((error) => {
      if (controller.signal.aborted) return
      setSyncStatus(isNetworkUnavailableError(error) ? 'offline' : 'error')
    })
    return () => controller.abort()
  }, [activeMemberIds, familyId, networkStatus, remote, syncEnabled])

  const saveBestScore = useCallback((memberId: string, score: number) => {
    const next = saveFamilyJumpBestScore(familyId, memberId, score)
    setRecords(next)
    return next
  }, [familyId])

  return { records, saveBestScore, syncStatus }
}
