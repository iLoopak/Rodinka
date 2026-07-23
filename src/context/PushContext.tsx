import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFamilyCore } from './family/FamilyCoreContext'
import * as webPush from '../push/pushClient'
import { isNativeApp } from '../platform/capacitor'
import type { PushClientModule } from '../push/PushClientModule'
import type { PushCapability, PushDevice } from '../push/pushClient'
import { t } from '../strings'

// `nativePushClient.ts` (and `@capacitor/push-notifications`) is dynamically
// imported so it never lands in the eager web bundle — PushContext is on the
// app's always-mounted provider tree, and this branch only ever runs inside
// the native shell. Resolved once and cached: which platform this is never
// changes at runtime.
let implPromise: Promise<PushClientModule> | null = null
function getPushImpl(): Promise<PushClientModule> {
  if (!implPromise) implPromise = isNativeApp() ? import('../push/nativePushClient') : Promise.resolve(webPush)
  return implPromise
}

// Safe placeholder for native's very first render, before `getPushImpl()`
// resolves — optimistic "supported, permission not checked yet", replaced
// within one effect tick by `refresh()`'s own call to `getPushImpl()`.
const NATIVE_PENDING_CAPABILITY: PushCapability = { code: 'supported', supported: true, permission: 'default' }
function detectPushCapabilitySync(): PushCapability {
  return isNativeApp() ? NATIVE_PENDING_CAPABILITY : webPush.detectPushCapability()
}

interface PushContextValue {
  capability: PushCapability
  devices: PushDevice[]
  currentDevice: { endpoint: string } | null
  browserSubscribed: boolean
  loading: boolean
  devicesLoading: boolean
  devicesLoaded: boolean
  busy: boolean
  error: string | null
  refresh: () => Promise<void>
  loadDevices: () => Promise<void>
  enableCurrentDevice: () => Promise<void>
  disableCurrentDevice: () => Promise<void>
  revokeDevice: (id: string) => Promise<void>
  sendTest: () => Promise<void>
}

const PushContext = createContext<PushContextValue | null>(null)

export function PushProvider({ children }: { children: ReactNode }) {
  const { familyId } = useFamilyCore()
  const [capability, setCapability] = useState(() => detectPushCapabilitySync())
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [devicesLoaded, setDevicesLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentEndpointRef = useRef(currentEndpoint)
  const familyIdRef = useRef(familyId)
  const devicesLoadedRef = useRef(devicesLoaded)
  const currentRequestRef = useRef<Promise<void> | null>(null)
  const deviceListRequestRef = useRef<Promise<void> | null>(null)
  currentEndpointRef.current = currentEndpoint
  familyIdRef.current = familyId
  devicesLoadedRef.current = devicesLoaded

  const refresh = useCallback((): Promise<void> => {
    if (currentRequestRef.current) return currentRequestRef.current
    const requestFamilyId = familyId
    const request = (async () => {
      try {
        const impl = await getPushImpl()
        setCapability(impl.detectPushCapability())
        const subscription = await impl.reconcileCurrentSubscription(familyId)
        if (requestFamilyId !== familyIdRef.current) return
        const endpoint = subscription?.endpoint ?? null
        currentEndpointRef.current = endpoint
        setCurrentEndpoint(endpoint)
        setDevices((current) => current.map((device) => ({ ...device, current: device.endpoint === endpoint })))
        setError(null)
      } catch (caught) {
        if (requestFamilyId === familyIdRef.current) setError(caught instanceof Error ? caught.message : t.reminders.pushStateLoadFailed)
      } finally {
        if (requestFamilyId === familyIdRef.current) setLoading(false)
      }
    })().finally(() => {
      if (currentRequestRef.current === request) currentRequestRef.current = null
    })
    currentRequestRef.current = request
    return request
  }, [familyId])

  const loadDeviceList = useCallback((force = false): Promise<void> => {
    if (!force && devicesLoadedRef.current) return Promise.resolve()
    if (deviceListRequestRef.current) return deviceListRequestRef.current
    setDevicesLoading(true)
    const requestFamilyId = familyId
    const request = (async () => {
      await refresh()
      if (requestFamilyId !== familyIdRef.current) return
      const impl = await getPushImpl()
      const nextDevices = await impl.loadPushDevices(currentEndpointRef.current)
      if (requestFamilyId !== familyIdRef.current) return
      setDevices(nextDevices)
      setDevicesLoaded(true)
      setError(null)
    })().catch((caught) => {
      if (requestFamilyId === familyIdRef.current) setError(caught instanceof Error ? caught.message : t.reminders.deviceListFailed)
    }).finally(() => {
      if (deviceListRequestRef.current === request) {
        setDevicesLoading(false)
        deviceListRequestRef.current = null
      }
    })
    deviceListRequestRef.current = request
    return request
  }, [familyId, refresh])

  const loadDevices = useCallback(() => loadDeviceList(false), [loadDeviceList])

  useEffect(() => {
    setDevices([])
    setDevicesLoaded(false)
    devicesLoadedRef.current = false
    currentRequestRef.current = null
    deviceListRequestRef.current = null
    void refresh()
  }, [refresh])
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'PUSH_SUBSCRIPTION_CHANGED') return
      void refresh().then(() => devicesLoadedRef.current ? loadDeviceList(true) : undefined)
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [loadDeviceList, refresh])

  const run = useCallback(async (operation: () => Promise<void>) => {
    const reloadDeviceList = devicesLoadedRef.current
    setBusy(true); setError(null)
    try {
      await operation()
      await refresh()
      if (reloadDeviceList) await loadDeviceList(true)
    }
    catch (caught) { const message = caught instanceof Error ? caught.message : t.reminders.operationFailed; setError(message); throw caught }
    finally { setBusy(false) }
  }, [loadDeviceList, refresh])

  const currentDevice = useMemo(() => currentEndpoint ? { endpoint: currentEndpoint } : null, [currentEndpoint])
  const value: PushContextValue = {
    capability, devices, currentDevice, browserSubscribed: Boolean(currentEndpoint), loading, devicesLoading, devicesLoaded, busy, error, refresh, loadDevices,
    enableCurrentDevice: () => run(async () => { const impl = await getPushImpl(); await impl.enablePushOnCurrentDevice(familyId) }),
    disableCurrentDevice: () => run(async () => {
      const impl = await getPushImpl()
      const currentId = devices.find((device) => device.current)?.id ?? null
      await impl.unsubscribeCurrentDevice(currentId, currentEndpointRef.current)
    }),
    revokeDevice: (id) => run(async () => {
      const impl = await getPushImpl()
      const device = devices.find((item) => item.id === id)
      if (device?.current) await impl.unsubscribeCurrentDevice(id, device.endpoint); else await impl.revokePushDevice(id)
    }),
    sendTest: () => run(async () => { const impl = await getPushImpl(); await impl.sendTestPush(familyId) }),
  }
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>
}

export function usePush() {
  const context = useContext(PushContext)
  if (!context) throw new Error('usePush must be used within PushProvider')
  return context
}

