// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { browserOpen, isNativeApp } = vi.hoisted(() => ({
  browserOpen: vi.fn<(options: { url: string }) => Promise<void>>(),
  isNativeApp: vi.fn<() => boolean>(),
}))

vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }))
vi.mock('./capacitor', () => ({ isNativeApp }))

import { openExternalUrl } from './externalLinks'

describe('openExternalUrl', () => {
  beforeEach(() => {
    browserOpen.mockReset().mockResolvedValue()
    isNativeApp.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the system browser inside the native shell and never touches window.open', async () => {
    isNativeApp.mockReturnValue(true)
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null)

    await openExternalUrl('https://example.com')

    expect(browserOpen).toHaveBeenCalledWith({ url: 'https://example.com' })
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('opens a safe new tab on the web and never uses the Capacitor browser', async () => {
    isNativeApp.mockReturnValue(false)
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null)

    await openExternalUrl('https://example.com')

    expect(windowOpen).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    expect(browserOpen).not.toHaveBeenCalled()
  })

  it('awaits the native browser so callers can sequence work after it opens', async () => {
    isNativeApp.mockReturnValue(true)
    let resolved = false
    browserOpen.mockImplementation(() => new Promise<void>((resolve) => {
      setTimeout(() => {
        resolved = true
        resolve()
      }, 0)
    }))

    await openExternalUrl('https://example.com')
    expect(resolved).toBe(true)
  })
})
