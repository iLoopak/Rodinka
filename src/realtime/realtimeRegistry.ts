import type { RealtimeConnectionState } from './connectionState'
import { registerRealtimeStatus, unregisterRealtimeStatus, updateRealtimeStatus } from './realtimeStatusStore'

export interface ActiveRealtimeSubscription {
  channelName: string
  owner: string
  tables: string[]
  openedAt: number
  openReason: string
  instanceId: string
}

export interface ClosedRealtimeSubscription extends ActiveRealtimeSubscription {
  closedAt: number
  closeReason: string
  durationMs: number
  channelStillActive: boolean
}

interface LifecycleInput {
  channelName: string
  owner: string
  tables: string[]
  openReason: string
}

export interface RealtimeLifecycle {
  instanceId: string
  status: (state: RealtimeConnectionState) => void
  close: (reason?: string) => boolean
}

const diagnosticsEnabled = import.meta.env.DEV
const active = new Map<string, ActiveRealtimeSubscription>()
const closed: ClosedRealtimeSubscription[] = []
let sequence = 0

export function openRealtimeLifecycle(input: LifecycleInput): RealtimeLifecycle {
  const instanceId = `realtime-${++sequence}`
  const record: ActiveRealtimeSubscription | null = diagnosticsEnabled ? {
    ...input,
    tables: [...new Set(input.tables)].sort(),
    openedAt: Date.now(),
    instanceId,
  } : null

  registerRealtimeStatus(instanceId, input.owner)
  if (diagnosticsEnabled) {
    const duplicateCount = [...active.values()].filter(({ channelName }) => channelName === input.channelName).length
    if (duplicateCount > 0) {
      console.warn('[Rodinka realtime] duplicate channel instance', input.channelName, duplicateCount + 1, input.owner)
    }
    active.set(instanceId, record!)
  }

  let isClosed = false
  return {
    instanceId,
    status(state) {
      if (!isClosed) updateRealtimeStatus(instanceId, state)
    },
    close(reason = 'effect-cleanup') {
      if (isClosed) return false
      isClosed = true
      unregisterRealtimeStatus(instanceId)
      if (diagnosticsEnabled) {
        active.delete(instanceId)
        const closedAt = Date.now()
        closed.push({
          ...record!,
          closedAt,
          closeReason: reason,
          durationMs: closedAt - record!.openedAt,
          channelStillActive: [...active.values()].some(({ channelName }) => channelName === input.channelName),
        })
      }
      return true
    },
  }
}

export function getRealtimeRegistrySnapshot() {
  return {
    enabled: diagnosticsEnabled,
    active: [...active.values()],
    closed: [...closed],
  }
}

export function resetRealtimeRegistryForTests() {
  for (const instanceId of active.keys()) unregisterRealtimeStatus(instanceId)
  active.clear()
  closed.length = 0
  sequence = 0
}
