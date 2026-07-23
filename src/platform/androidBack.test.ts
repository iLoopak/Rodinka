import { beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = vi.hoisted(() => ({ addListener: vi.fn() }))
vi.mock('@capacitor/app', () => ({ App: appMock }))

import { decideBackAction, registerAndroidBackButton, unregisterAndroidBackButtonForTests } from './androidBack'

describe('decideBackAction', () => {
  it('closes the topmost overlay first, regardless of history', () => {
    expect(decideBackAction({ hasDismissable: true, canGoBack: true })).toBe('dismiss')
    expect(decideBackAction({ hasDismissable: true, canGoBack: false })).toBe('dismiss')
  })

  it('navigates back when nothing is open but in-app history exists', () => {
    expect(decideBackAction({ hasDismissable: false, canGoBack: true })).toBe('back')
  })

  it('minimizes the app at the root screen with nothing open', () => {
    expect(decideBackAction({ hasDismissable: false, canGoBack: false })).toBe('minimize')
  })
})

describe('registerAndroidBackButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appMock.addListener.mockResolvedValue({ remove: vi.fn() })
    unregisterAndroidBackButtonForTests()
  })

  it('registers the backButton listener only once across repeated calls', () => {
    registerAndroidBackButton()
    registerAndroidBackButton()
    registerAndroidBackButton()
    expect(appMock.addListener).toHaveBeenCalledTimes(1)
    expect(appMock.addListener).toHaveBeenCalledWith('backButton', expect.any(Function))
  })
})
