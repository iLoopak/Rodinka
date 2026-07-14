import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useFamilyData } from './FamilyDataContext'
import {
  detectPushCapability,
  enablePushOnCurrentDevice,
  loadPushDevices,
  reconcileCurrentSubscription,
  revokePushDevice,
  sendTestPush,
  unsubscribeCurrentDevice,
  type PushCapability,
  type PushDevice,
} from '../push/pushClient'
import { t } from '../strings'

interface PushContextValue {
  capability: PushCapability
  devices: PushDevice[]
  currentDevice: PushDevice | null
  browserSubscribed: boolean
  loading: boolean
  busy: boolean
  error: string | null
  refresh: () => Promise<void>
  enableCurrentDevice: () => Promise<void>
  disableCurrentDevice: () => Promise<void>
  revokeDevice: (id: string) => Promise<void>
  sendTest: () => Promise<void>
}

const PushContext = createContext<PushContextValue | null>(null)

export function PushProvider({ children }: { children: ReactNode }) {
  const { familyId } = useFamilyData()
  const [capability, setCapability] = useState(() => detectPushCapability())
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setCapability(detectPushCapability())
    try {
      const subscription = await reconcileCurrentSubscription(familyId)
      const endpoint = subscription?.endpoint ?? null
      setCurrentEndpoint(endpoint)
      setDevices(await loadPushDevices(endpoint))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.reminders.pushStateLoadFailed)
    } finally {
      setLoading(false)
    }
  }, [familyId])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => { if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') void refresh() }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [refresh])

  const run = useCallback(async (operation: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await operation(); await refresh() }
    catch (caught) { const message = caught instanceof Error ? caught.message : t.reminders.operationFailed; setError(message); throw caught }
    finally { setBusy(false) }
  }, [refresh])

  const currentDevice = useMemo(() => devices.find((device) => device.current && !device.revokedAt && !device.disabledAt) ?? null, [devices])
  const value: PushContextValue = {
    capability, devices, currentDevice, browserSubscribed: Boolean(currentEndpoint), loading, busy, error, refresh,
    enableCurrentDevice: () => run(async () => { await enablePushOnCurrentDevice(familyId) }),
    disableCurrentDevice: () => run(async () => { await unsubscribeCurrentDevice(currentDevice?.id ?? null) }),
    revokeDevice: (id) => run(async () => {
      const device = devices.find((item) => item.id === id)
      if (device?.current) await unsubscribeCurrentDevice(id); else await revokePushDevice(id)
    }),
    sendTest: () => run(async () => { await sendTestPush(familyId) }),
  }
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePush() {
  const context = useContext(PushContext)
  if (!context) throw new Error('usePush must be used within PushProvider')
  return context
}

