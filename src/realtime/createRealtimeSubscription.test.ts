import { describe, expect, it, vi } from 'vitest'

const channelMock = vi.hoisted(() => vi.fn())
const removeChannelMock = vi.hoisted(() => vi.fn())

vi.mock('../supabaseClient', () => ({
  supabase: {
    channel: channelMock,
    removeChannel: removeChannelMock,
  },
}))

const { createRealtimeSubscription } = await import('./createRealtimeSubscription')

interface FakeChannel {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  emit: (event: string, table: string, payload: unknown) => void
  status: (status: string, error?: Error) => void
}

function makeFakeChannel(): FakeChannel {
  const handlers = new Map<string, ((payload: unknown) => void)[]>()
  let subscribeCallback: ((status: string, error?: Error) => void) | undefined

  const channel = {} as FakeChannel
  channel.on = vi.fn((_type: string, config: { event: string; table: string }, callback: (payload: unknown) => void) => {
    const key = `${config.event}:${config.table}`
    const list = handlers.get(key) ?? []
    list.push(callback)
    handlers.set(key, list)
    return channel
  })
  channel.subscribe = vi.fn((cb: (status: string, error?: Error) => void) => {
    subscribeCallback = cb
    return channel
  })
  channel.emit = (event, table, row) => {
    const payload = event === 'DELETE' ? { old: row } : { new: row }
    for (const callback of handlers.get(`${event}:${table}`) ?? []) callback(payload)
  }
  channel.status = (status, error) => subscribeCallback?.(status, error)
  return channel
}

describe('createRealtimeSubscription', () => {
  it('dispatches INSERT/UPDATE/DELETE payloads to the matching table config only', () => {
    const channel = makeFakeChannel()
    channelMock.mockReturnValue(channel)

    const choresInsert = vi.fn()
    const choresUpdate = vi.fn()
    const completionsDelete = vi.fn()

    createRealtimeSubscription({
      channelName: 'family:f1:chores',
      tables: [
        { table: 'chores', filter: 'family_id=eq.f1', onInsert: choresInsert, onUpdate: choresUpdate },
        { table: 'chore_completions', filter: 'family_id=eq.f1', onDelete: completionsDelete },
      ],
    })

    channel.emit('INSERT', 'chores', { id: 'c1', title: 'Dishes' })
    expect(choresInsert).toHaveBeenCalledWith({ id: 'c1', title: 'Dishes' })
    expect(choresUpdate).not.toHaveBeenCalled()

    channel.emit('DELETE', 'chore_completions', { id: 'x1' })
    expect(completionsDelete).toHaveBeenCalledWith({ id: 'x1' })

    // A chores UPDATE never touches the chore_completions handler.
    channel.emit('UPDATE', 'chores', { id: 'c1', title: 'Dishes (done)' })
    expect(choresUpdate).toHaveBeenCalledWith({ id: 'c1', title: 'Dishes (done)' })
  })

  it('maps subscribe status transitions, survives a disconnect/reconnect, and keeps dispatching events afterwards', () => {
    const channel = makeFakeChannel()
    channelMock.mockReturnValue(channel)
    const onStatusChange = vi.fn()
    const onInsert = vi.fn()

    createRealtimeSubscription({
      channelName: 'family:f1:activities',
      tables: [{ table: 'activities', filter: 'family_id=eq.f1', onInsert }],
      onStatusChange,
    })

    channel.status('SUBSCRIBED')
    expect(onStatusChange).toHaveBeenLastCalledWith('connected')

    channel.status('CHANNEL_ERROR', new Error('boom'))
    expect(onStatusChange).toHaveBeenLastCalledWith('reconnecting')

    channel.status('CLOSED')
    expect(onStatusChange).toHaveBeenLastCalledWith('disconnected')

    // Reconnect: the underlying client re-subscribes the same channel.
    channel.status('SUBSCRIBED')
    expect(onStatusChange).toHaveBeenLastCalledWith('connected')

    channel.emit('INSERT', 'activities', { id: 'a1' })
    expect(onInsert).toHaveBeenCalledWith({ id: 'a1' })
  })

  it('unsubscribing removes exactly the one channel it created', () => {
    const channel = makeFakeChannel()
    channelMock.mockReturnValue(channel)

    const unsubscribe = createRealtimeSubscription({
      channelName: 'family:f1:medical',
      tables: [{ table: 'medical_records', filter: 'family_id=eq.f1', onUpdate: vi.fn() }],
    })

    unsubscribe()
    expect(removeChannelMock).toHaveBeenCalledTimes(1)
    expect(removeChannelMock).toHaveBeenCalledWith(channel)
  })
})
