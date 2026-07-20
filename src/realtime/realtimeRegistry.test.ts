import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRealtimeRegistrySnapshot, openRealtimeLifecycle, resetRealtimeRegistryForTests } from './realtimeRegistry'
import { getRealtimeSummarySnapshot, resetRealtimeStatusStoreForTests } from './realtimeStatusStore'

describe('realtime registry', () => {
  beforeEach(() => {
    resetRealtimeRegistryForTests()
    resetRealtimeStatusStoreForTests()
  })

  afterEach(() => vi.restoreAllMocks())

  it('records add, status, owner mapping, and close lifecycle without payload data', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(145)
    const lifecycle = openRealtimeLifecycle({
      channelName: 'family:f1:medical',
      owner: 'MedicalProvider',
      openReason: 'provider-mount',
      tables: ['medical_records'],
    })

    expect(getRealtimeSummarySnapshot()).toEqual({
      overall: 'connecting',
      disconnectedOwners: [],
      activeChannelCount: 1,
    })
    lifecycle.status('disconnected')
    expect(getRealtimeSummarySnapshot().disconnectedOwners).toEqual(['MedicalProvider'])

    expect(lifecycle.close('effect-cleanup')).toBe(true)
    expect(lifecycle.close('second-cleanup')).toBe(false)
    expect(getRealtimeRegistrySnapshot().closed[0]).toMatchObject({
      closeReason: 'effect-cleanup',
      durationMs: 45,
      channelStillActive: false,
    })
    expect(getRealtimeSummarySnapshot().activeChannelCount).toBe(0)
  })

  it('warns and counts duplicate channel instances while allowing distinct channels in parallel', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const first = openRealtimeLifecycle({ channelName: 'family:f1:calendar', owner: 'CalendarA', openReason: 'mount', tables: ['chores'] })
    const duplicate = openRealtimeLifecycle({ channelName: 'family:f1:calendar', owner: 'CalendarB', openReason: 'hmr-remount', tables: ['chores'] })
    const distinct = openRealtimeLifecycle({ channelName: 'family:f1:messages', owner: 'MessagesProvider', openReason: 'mount', tables: ['messages'] })

    expect(getRealtimeRegistrySnapshot().active).toHaveLength(3)
    expect(warn).toHaveBeenCalledWith('[Rodinka realtime] duplicate channel instance', 'family:f1:calendar', 2, 'CalendarB')
    duplicate.close('cleanup')
    expect(getRealtimeRegistrySnapshot().closed.at(-1)?.channelStillActive).toBe(true)
    first.close('cleanup')
    distinct.close('cleanup')
  })

  it('supports StrictMode-like mount, cleanup, and remount without a duplicate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    openRealtimeLifecycle({ channelName: 'family:f1:shopping', owner: 'ShoppingRepository', openReason: 'mount', tables: ['shopping_items'] }).close('strict-mode-cleanup')
    const remount = openRealtimeLifecycle({ channelName: 'family:f1:shopping', owner: 'ShoppingRepository', openReason: 'strict-mode-remount', tables: ['shopping_items'] })

    expect(warn).not.toHaveBeenCalled()
    expect(getRealtimeRegistrySnapshot().active).toHaveLength(1)
    remount.close('cleanup')
  })
})
