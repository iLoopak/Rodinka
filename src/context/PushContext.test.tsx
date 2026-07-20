// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  loadDevices: vi.fn(),
  serviceWorkerHandler: null as ((event: MessageEvent) => void) | null,
}))

vi.mock('./family/FamilyCoreContext', () => ({ useFamilyCore: () => ({ familyId: 'family-1' }) }))
vi.mock('../push/pushClient', () => ({
  detectPushCapability: () => ({ code: 'supported', permission: 'granted', supported: true }),
  reconcileCurrentSubscription: mocks.reconcile,
  loadPushDevices: mocks.loadDevices,
  enablePushOnCurrentDevice: vi.fn(),
  revokePushDevice: vi.fn(),
  sendTestPush: vi.fn(),
  unsubscribeCurrentDevice: vi.fn(),
}))

import { PushProvider, usePush } from './PushContext'

function Consumer() {
  const push = usePush()
  return <>
    <output data-testid="current">{push.currentDevice?.endpoint ?? 'none'}</output>
    <output data-testid="devices">{push.devices.length}</output>
    <button type="button" onClick={() => { void push.loadDevices() }}>Load devices</button>
  </>
}

beforeEach(() => {
  mocks.serviceWorkerHandler = null
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: vi.fn((_type: string, handler: (event: MessageEvent) => void) => { mocks.serviceWorkerHandler = handler }),
      removeEventListener: vi.fn(),
    },
  })
  mocks.reconcile.mockReset().mockResolvedValue({ endpoint: 'endpoint-current' })
  mocks.loadDevices.mockReset().mockResolvedValue([{
    id: 'device-1', endpoint: 'endpoint-current', deviceName: 'Browser', platform: null, browser: null,
    createdAt: '2026-07-20', lastSeenAt: '2026-07-20', revokedAt: null, disabledAt: null, current: true,
  }])
})

afterEach(cleanup)

describe('PushProvider startup split', () => {
  it('reconciles current-device state without loading the full device list', async () => {
    render(<PushProvider><Consumer /></PushProvider>)
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('endpoint-current'))
    expect(mocks.loadDevices).not.toHaveBeenCalled()
    expect(screen.getByTestId('devices').textContent).toBe('0')
  })

  it('loads the device list only when management asks for it', async () => {
    render(<PushProvider><Consumer /></PushProvider>)
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('endpoint-current'))
    fireEvent.click(screen.getByRole('button', { name: 'Load devices' }))
    await waitFor(() => expect(screen.getByTestId('devices').textContent).toBe('1'))
    expect(mocks.loadDevices).toHaveBeenCalledTimes(1)
  })

  it('reconciles pushsubscriptionchange and reloads an already-open device manager', async () => {
    render(<PushProvider><Consumer /></PushProvider>)
    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('endpoint-current'))
    fireEvent.click(screen.getByRole('button', { name: 'Load devices' }))
    await waitFor(() => expect(mocks.loadDevices).toHaveBeenCalledTimes(1))

    mocks.reconcile.mockResolvedValue({ endpoint: 'endpoint-next' })
    await act(async () => {
      mocks.serviceWorkerHandler?.({ data: { type: 'PUSH_SUBSCRIPTION_CHANGED' } } as MessageEvent)
    })

    await waitFor(() => expect(screen.getByTestId('current').textContent).toBe('endpoint-next'))
    await waitFor(() => expect(mocks.loadDevices).toHaveBeenCalledTimes(2))
  })
})
