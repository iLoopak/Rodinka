import { describe, expect, it } from 'vitest'
import { detectPushCapability, urlBase64ToUint8Array } from './pushClient'

const supported = {
  secure: true, hostname: 'rodinka.example', hasServiceWorker: true,
  hasNotification: true, hasPushManager: true, ios: false, standalone: false,
  vapidKey: 'BEl6dGVzdC1wdWJsaWMta2V5', permission: 'default' as const,
}

describe('push capability detection', () => {
  it('reports a supported browser without requesting permission', () => {
    expect(detectPushCapability(supported)).toEqual({ code: 'supported', supported: true, permission: 'default' })
  })

  it('distinguishes blocked permission and missing configuration', () => {
    expect(detectPushCapability({ ...supported, permission: 'denied' }).code).toBe('blocked')
    expect(detectPushCapability({ ...supported, vapidKey: '' }).code).toBe('missing-vapid-key')
  })

  it('requires Home Screen mode on iOS', () => {
    expect(detectPushCapability({ ...supported, ios: true, standalone: false }).code).toBe('ios-install-required')
    expect(detectPushCapability({ ...supported, ios: true, standalone: true }).code).toBe('supported')
  })

  it('allows localhost but rejects an insecure production origin', () => {
    expect(detectPushCapability({ ...supported, secure: false, hostname: 'localhost' }).code).toBe('supported')
    expect(detectPushCapability({ ...supported, secure: false, hostname: 'rodinka.example' }).code).toBe('insecure')
  })

  it('decodes URL-safe VAPID keys', () => {
    expect([...urlBase64ToUint8Array('AQID-_8')]).toEqual([1, 2, 3, 251, 255])
  })
})

