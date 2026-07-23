import { describe, expect, it, vi } from 'vitest'

describe('releasePushOnSignOut platform dispatch', () => {
  it('calls the web release path when not native', async () => {
    vi.resetModules()
    const releaseWeb = vi.fn().mockResolvedValue(true)
    const releaseNative = vi.fn().mockResolvedValue(false)
    vi.doMock('../platform/capacitor', () => ({ isNativeApp: () => false }))
    vi.doMock('./pushClient', () => ({ releasePushOnSignOut: releaseWeb }))
    vi.doMock('./nativePushClient', () => ({ releasePushOnSignOut: releaseNative }))

    const { releasePushOnSignOut } = await import('./releaseOnSignOut')
    expect(await releasePushOnSignOut()).toBe(true)
    expect(releaseWeb).toHaveBeenCalledOnce()
    expect(releaseNative).not.toHaveBeenCalled()
  })

  it('calls the native release path when native', async () => {
    vi.resetModules()
    const releaseWeb = vi.fn().mockResolvedValue(true)
    const releaseNative = vi.fn().mockResolvedValue(false)
    vi.doMock('../platform/capacitor', () => ({ isNativeApp: () => true }))
    vi.doMock('./pushClient', () => ({ releasePushOnSignOut: releaseWeb }))
    vi.doMock('./nativePushClient', () => ({ releasePushOnSignOut: releaseNative }))

    const { releasePushOnSignOut } = await import('./releaseOnSignOut')
    expect(await releasePushOnSignOut()).toBe(false)
    expect(releaseNative).toHaveBeenCalledOnce()
    expect(releaseWeb).not.toHaveBeenCalled()
  })
})
