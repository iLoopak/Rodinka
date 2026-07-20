// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Supabase test double. Records every table read so the tests can assert what
// a screen did NOT fetch — which is the whole point of Wave 5.
// ---------------------------------------------------------------------------

const tableReads = vi.hoisted(() => [] as string[])
const rpcCalls = vi.hoisted(() => [] as string[])
const tableResults = vi.hoisted(() => new Map<string, unknown[]>())
const rpcResults = vi.hoisted(() => new Map<string, unknown>())

const fromMock = vi.hoisted(() => vi.fn((table: string) => {
  tableReads.push(table)
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'limit', 'in', 'or']) {
    builder[method] = () => builder
  }
  builder.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: tableResults.get(table) ?? [], error: null }).then(resolve)
  return builder
}))

const rpcMock = vi.hoisted(() => vi.fn(async (name: string) => {
  rpcCalls.push(name)
  return { data: rpcResults.get(name) ?? null, error: null }
}))

const channelMock = vi.hoisted(() => vi.fn())
const removeChannelMock = vi.hoisted(() => vi.fn())

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
    channel: channelMock,
    removeChannel: removeChannelMock,
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
  },
}))

vi.mock('../family/FamilyCoreContext', () => ({
  useFamilyCore: () => ({ familyId: 'f1', currentMember: { id: 'me' }, userId: 'u1', userEmail: 'a@b.c', isParentOrAdmin: true }),
}))

const { MessagesSummaryProvider, useActiveConversationId, useTotalUnreadCount } = await import('./MessagesSummaryContext')
const { MessagesContentProvider, useMessagesContent } = await import('./MessagesContentContext')

// ---------------------------------------------------------------------------
// Realtime test double.
// ---------------------------------------------------------------------------

interface FakeChannel {
  name: string
  tables: string[]
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  emit: (event: string, table: string, row: unknown) => void
}

const openChannels: FakeChannel[] = []
const closedChannels = new Set<FakeChannel>()

function makeFakeChannel(name: string): FakeChannel {
  const handlers = new Map<string, ((payload: unknown) => void)[]>()
  const channel = { name, tables: [] as string[] } as FakeChannel
  channel.on = vi.fn((_type: string, config: { event: string; table: string }, callback: (payload: unknown) => void) => {
    const key = `${config.event}:${config.table}`
    handlers.set(key, [...(handlers.get(key) ?? []), callback])
    if (!channel.tables.includes(config.table)) channel.tables.push(config.table)
    return channel
  })
  channel.subscribe = vi.fn(() => channel)
  channel.emit = (event, table, row) => {
    const payload = event === 'DELETE' ? { old: row } : { new: row }
    for (const callback of handlers.get(`${event}:${table}`) ?? []) callback(payload)
  }
  return channel
}

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const conversation = {
  id: 'c1', family_id: 'f1', kind: 'group', title: null, direct_key: null,
  created_by_member_id: null, last_message_at: '2026-07-20T10:00:00Z',
  last_message_preview: 'ahoj', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-20T10:00:00Z',
}

const selfMembership = {
  conversation_id: 'c1', member_id: 'me', role: 'member', joined_at: '2026-07-01T00:00:00Z',
  last_read_at: '2026-07-20T09:00:00Z', muted_at: null, muted_until: null,
  mute_scope: 'none', archived_at: null,
}

const serverMessage = (id: string, createdAt: string) => ({
  id, conversation_id: 'c1', family_id: 'f1', sender_member_id: 'other',
  content_type: 'text', body: id, client_id: null, reply_to_message_id: null,
  system_kind: null, edited_at: null, deleted_at: null, has_attachments: false,
  created_at: createdAt,
})

beforeEach(() => {
  tableReads.length = 0
  rpcCalls.length = 0
  openChannels.length = 0
  closedChannels.clear()
  removeChannelMock.mockImplementation((channel: FakeChannel) => {
    closedChannels.add(channel)
    return Promise.resolve('ok')
  })
  tableResults.clear()
  rpcResults.clear()
  tableResults.set('conversations', [conversation])
  tableResults.set('conversation_members', [selfMembership])
  tableResults.set('messages', [
    serverMessage('m1', '2026-07-20T09:30:00Z'),
    serverMessage('m2', '2026-07-20T09:45:00Z'),
    serverMessage('m3', '2026-07-20T10:00:00Z'),
  ])
  channelMock.mockImplementation((name: string) => {
    const channel = makeFakeChannel(name)
    openChannels.push(channel)
    return channel
  })
})

afterEach(cleanup)

// A stand-in for the header: it reads the unread number and nothing else.
let bellRenders = 0
function Bell() {
  bellRenders += 1
  return <span data-testid="bell">{useTotalUnreadCount()}</span>
}

// A stand-in for AppShell's push bridge boundary.
let shellRenders = 0
function ShellBridge() {
  shellRenders += 1
  return <span data-testid="active">{useActiveConversationId() ?? 'none'}</span>
}

function Thread() {
  const { getMessages, loadInitialMessages } = useMessagesContent()
  const messages = getMessages('c1')
  return (
    <div>
      <button type="button" data-testid="load" onClick={() => void loadInitialMessages('c1')}>load</button>
      <span data-testid="thread">{messages.map((m) => m.id).join(',')}</span>
    </div>
  )
}

function Global({ children }: { children?: ReactNode }) {
  return (
    <MessagesSummaryProvider familyId="f1" currentMemberId="me">
      <Bell />
      <ShellBridge />
      {children}
    </MessagesSummaryProvider>
  )
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

const liveChannel = (name: string) => openChannels.find((c) => c.name === name && !closedChannels.has(c))
const summaryChannel = () => liveChannel('family:f1:messages')!
const contentChannel = () => liveChannel('family:f1:messages-content')

describe('Wave 5 — messages summary / content split', () => {
  it('does not fetch message content when only the global summary is mounted', async () => {
    render(<Global />)
    await flush()

    expect(tableReads).toContain('conversations')
    expect(tableReads).toContain('conversation_members')
    // The three heavy content tables must be absent from a Home-equivalent boot.
    expect(tableReads).not.toContain('messages')
    expect(tableReads).not.toContain('message_reactions')
    expect(tableReads).not.toContain('message_attachments')
    expect(rpcCalls).not.toContain('resolve_message_entities')
  })

  it('shows an unread badge from metadata alone, then an exact count once the route loads a page', async () => {
    const view = render(<Global />)
    await flush()
    // Metadata only: "there is something new here".
    expect(screen.getByTestId('bell').textContent).toBe('1')

    view.rerender(
      <Global>
        <MessagesContentProvider><Thread /></MessagesContentProvider>
      </Global>,
    )
    await act(async () => { screen.getByTestId('load').click() })
    await flush()

    expect(tableReads).toContain('messages')
    expect(screen.getByTestId('thread').textContent).toBe('m1,m2,m3')
    expect(screen.getByTestId('bell').textContent).toBe('3')
  })

  it('keeps the unread count live after the route unmounts', async () => {
    const view = render(
      <Global>
        <MessagesContentProvider><Thread /></MessagesContentProvider>
      </Global>,
    )
    await act(async () => { screen.getByTestId('load').click() })
    await flush()
    expect(screen.getByTestId('bell').textContent).toBe('3')

    // Leave /messages — the heavy provider goes away, the badge does not.
    view.rerender(<Global />)
    await flush()
    expect(screen.getByTestId('bell').textContent).toBe('3')
    expect(contentChannel()).toBeUndefined()

    await act(async () => {
      summaryChannel().emit('INSERT', 'messages', serverMessage('m4', '2026-07-20T12:00:00Z'))
    })
    expect(screen.getByTestId('bell').textContent).toBe('4')
  })

  it('drops a soft-deleted message from the badge while off the route', async () => {
    const view = render(
      <Global>
        <MessagesContentProvider><Thread /></MessagesContentProvider>
      </Global>,
    )
    await act(async () => { screen.getByTestId('load').click() })
    await flush()
    view.rerender(<Global />)
    await flush()

    await act(async () => {
      summaryChannel().emit('UPDATE', 'messages', { ...serverMessage('m3', '2026-07-20T10:00:00Z'), deleted_at: '2026-07-20T12:00:00Z' })
    })
    expect(screen.getByTestId('bell').textContent).toBe('2')
  })

  it('gives the messages table exactly one subscription owner', async () => {
    render(
      <Global>
        <MessagesContentProvider><Thread /></MessagesContentProvider>
      </Global>,
    )
    await flush()

    const owners = openChannels.filter((c) => c.tables.includes('messages'))
    expect(owners.map((c) => c.name)).toEqual(['family:f1:messages'])
    // The content channel carries only what the summary has no use for.
    expect(contentChannel()!.tables.sort()).toEqual(
      ['message_attachments', 'message_entity_refs', 'message_reactions'],
    )
    expect(summaryChannel().tables.sort()).toEqual(
      ['conversation_members', 'conversations', 'messages'],
    )
  })

  it('applies one realtime insert to the thread exactly once', async () => {
    render(
      <Global>
        <MessagesContentProvider><Thread /></MessagesContentProvider>
      </Global>,
    )
    await act(async () => { screen.getByTestId('load').click() })
    await flush()

    await act(async () => {
      summaryChannel().emit('INSERT', 'messages', serverMessage('m4', '2026-07-20T12:00:00Z'))
    })
    expect(screen.getByTestId('thread').textContent).toBe('m1,m2,m3,m4')
  })

  it('does not re-render the shell bridge when only chat content changes', async () => {
    render(
      <Global>
        <MessagesContentProvider><Thread /></MessagesContentProvider>
      </Global>,
    )
    await act(async () => { screen.getByTestId('load').click() })
    await flush()

    const shellBefore = shellRenders
    const bellBefore = bellRenders
    await act(async () => {
      // A message the reader sent themselves: thread grows, unread does not.
      summaryChannel().emit('INSERT', 'messages', {
        ...serverMessage('m5', '2026-07-20T12:00:00Z'), sender_member_id: 'me',
      })
    })

    expect(screen.getByTestId('thread').textContent).toBe('m1,m2,m3,m5')
    expect(shellRenders).toBe(shellBefore)
    expect(bellRenders).toBe(bellBefore)
  })
})
