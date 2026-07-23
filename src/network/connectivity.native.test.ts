// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../platform/capacitor', () => ({ isNativeApp: () => true }))
const networkMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  addListener: vi.fn(),
}))
vi.mock('@capacitor/network', () => ({ Network: networkMock }))

import { getConnectivitySnapshot, resetConnectivityForTests, subscribeToConnectivity } from './connectivity'

describe('connectivity snapshot (native)', () => {
  let unsubscribe: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    networkMock.getStatus.mockResolvedValue({ connected: true, connectionType: 'wifi' })
    networkMock.addListener.mockResolvedValue({ remove: vi.fn() })
    resetConnectivityForTests()
  })

  afterEach(() => {
    unsubscribe?.()
    unsubscribe = undefined
  })

  it('sources the initial state from @capacitor/network, not navigator.onLine', async () => {
    unsubscribe = subscribeToConnectivity(() => {})
    await vi.waitFor(() => expect(networkMock.getStatus).toHaveBeenCalled())
    await vi.waitFor(() => expect(getConnectivitySnapshot().browserOnline).toBe(true))
  })

  it('reacts to a native networkStatusChange event', async () => {
    let changeHandler: ((status: { connected: boolean }) => void) | undefined
    networkMock.addListener.mockImplementation((_event: string, handler: (status: { connected: boolean }) => void) => {
      changeHandler = handler
      return Promise.resolve({ remove: vi.fn() })
    })
    unsubscribe = subscribeToConnectivity(() => {})
    await vi.waitFor(() => expect(networkMock.addListener).toHaveBeenCalledWith('networkStatusChange', expect.any(Function)))

    changeHandler?.({ connected: false })
    await vi.waitFor(() => expect(getConnectivitySnapshot().state).toBe('offline'))

    changeHandler?.({ connected: true })
    await vi.waitFor(() => expect(getConnectivitySnapshot().state).toBe('online'))
  })

  it('never touches window online/offline listeners natively', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    unsubscribe = subscribeToConnectivity(() => {})
    await vi.waitFor(() => expect(networkMock.getStatus).toHaveBeenCalled())
    expect(addSpy).not.toHaveBeenCalledWith('online', expect.any(Function))
    expect(addSpy).not.toHaveBeenCalledWith('offline', expect.any(Function))
    addSpy.mockRestore()
  })
})
