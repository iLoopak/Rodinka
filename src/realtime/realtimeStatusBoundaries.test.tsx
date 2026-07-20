// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealtimeLifecycle, resetRealtimeRegistryForTests } from './realtimeRegistry'
import { resetRealtimeStatusStoreForTests } from './realtimeStatusStore'
import { useRealtimeStatus } from '../hooks/useRealtimeStatus'

describe('realtime status boundary', () => {
  beforeEach(() => {
    resetRealtimeRegistryForTests()
    resetRealtimeStatusStoreForTests()
  })
  afterEach(cleanup)

  it('rerenders a shell subscriber when connection state changes, not for repeated state', () => {
    let renders = 0
    let status = ''
    function ShellProbe() {
      status = useRealtimeStatus()
      renders += 1
      return null
    }
    render(<ShellProbe />)
    expect({ renders, status }).toEqual({ renders: 1, status: 'connected' })

    let lifecycle!: ReturnType<typeof openRealtimeLifecycle>
    act(() => {
      lifecycle = openRealtimeLifecycle({
        channelName: 'family:f1:medical',
        owner: 'MedicalProvider',
        openReason: 'provider-mount',
        tables: ['medical_records'],
      })
    })
    expect({ renders, status }).toEqual({ renders: 2, status: 'connecting' })

    act(() => lifecycle.status('reconnecting'))
    expect({ renders, status }).toEqual({ renders: 3, status: 'reconnecting' })
    act(() => lifecycle.status('reconnecting'))
    expect(renders).toBe(3)

    let second!: ReturnType<typeof openRealtimeLifecycle>
    act(() => {
      second = openRealtimeLifecycle({
        channelName: 'family:f1:shopping',
        owner: 'ShoppingRepository',
        openReason: 'repository-start',
        tables: ['shopping_items'],
      })
    })
    expect(renders).toBe(3)
    second.close('test-cleanup')
  })
})
