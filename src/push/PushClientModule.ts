import type { PushCapability, PushDevice } from './pushClient'

/**
 * Shared contract between `pushClient.ts` (Web Push) and
 * `nativePushClient.ts` (APNs/FCM via `@capacitor/push-notifications`) —
 * lets `PushContext` pick an implementation by platform without knowing
 * which transport it's actually talking to.
 */
export interface PushClientModule {
  detectPushCapability(): PushCapability
  enablePushOnCurrentDevice(familyId: string): Promise<{ endpoint: string }>
  loadPushDevices(currentEndpoint: string | null): Promise<PushDevice[]>
  reconcileCurrentSubscription(familyId: string): Promise<{ endpoint: string } | null>
  revokePushDevice(id: string): Promise<void>
  sendTestPush(familyId: string): Promise<{ ok: boolean; error?: string }>
  unsubscribeCurrentDevice(deviceId: string | null, endpoint?: string | null): Promise<void>
}
