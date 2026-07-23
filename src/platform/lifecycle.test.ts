// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ isNativeApp: vi.fn(() => false) }))
const statusBar = vi.hoisted(() => ({ setStyle: vi.fn().mockResolvedValue(undefined), setBackgroundColor: vi.fn().mockResolvedValue(undefined) }))
const splashScreen = vi.hoisted(() => ({ hide: vi.fn().mockResolvedValue(undefined) }))
const androidBack = vi.hoisted(() => ({ registerAndroidBackButton: vi.fn() }))
const deepLinks = vi.hoisted(() => ({ registerNativeDeepLinks: vi.fn() }))

vi.mock('./capacitor', () => platform)
vi.mock('@capacitor/status-bar', () => ({ StatusBar: statusBar, Style: { Light: 'LIGHT', Dark: 'DARK' } }))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: splashScreen }))
vi.mock('./androidBack', () => androidBack)
vi.mock('./nativeDeepLinks', () => deepLinks)

import { bootstrapNativeApp, resetNativeAppBootstrapForTests } from './lifecycle'

describe('bootstrapNativeApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    platform.isNativeApp.mockReturnValue(false)
    resetNativeAppBootstrapForTests()
  })

  it('does nothing on web', () => {
    bootstrapNativeApp()
    expect(androidBack.registerAndroidBackButton).not.toHaveBeenCalled()
    expect(deepLinks.registerNativeDeepLinks).not.toHaveBeenCalled()
    expect(statusBar.setStyle).not.toHaveBeenCalled()
  })

  it('wires the back button, deep links, and status bar exactly once on native', () => {
    platform.isNativeApp.mockReturnValue(true)
    bootstrapNativeApp()
    bootstrapNativeApp()
    bootstrapNativeApp()

    expect(androidBack.registerAndroidBackButton).toHaveBeenCalledTimes(1)
    expect(deepLinks.registerNativeDeepLinks).toHaveBeenCalledTimes(1)
    expect(statusBar.setStyle).toHaveBeenCalledTimes(1)
    expect(statusBar.setStyle).toHaveBeenCalledWith({ style: 'DARK' })
  })
})
