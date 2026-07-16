// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FamilyMember } from '../../hooks/useFamilyMembers'

const channelMock = vi.hoisted(() => vi.fn())
const removeChannelMock = vi.hoisted(() => vi.fn())
vi.mock('../../supabaseClient', () => ({
  supabase: { channel: channelMock, removeChannel: removeChannelMock },
}))

const parent: FamilyMember = {
  id: 'm1', family_id: 'family-1', display_name: 'Alex', role: 'parent', user_id: 'user-1', birth_date: null,
  color_key: null, avatar_path: null, avatar_url: null, grammatical_gender: null, vocative_name: null, status: 'active',
}

// Real (not vi.fn) stateful mock so the provider's own setMembers calls
// re-render — proves the realtime handler updates state a consumer sees.
vi.mock('../../hooks/useFamilyMembers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useFamilyMembers')>()
  return {
    ...actual,
    useFamilyMembers: () => {
      const [members, setMembers] = useState<FamilyMember[]>([parent])
      return { members, setMembers, loading: false, error: null, refresh: vi.fn() }
    },
  }
})

const { FamilyMembersProvider, useFamilyMembersData } = await import('./FamilyMembersContext')

interface FakeChannel {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  emit: (event: string, table: string, row: unknown) => void
}

function makeFakeChannel(): FakeChannel {
  const handlers = new Map<string, ((payload: unknown) => void)[]>()
  const channel = {} as FakeChannel
  channel.on = vi.fn((_type: string, config: { event: string; table: string }, callback: (payload: unknown) => void) => {
    const key = `${config.event}:${config.table}`
    handlers.set(key, [...(handlers.get(key) ?? []), callback])
    return channel
  })
  channel.subscribe = vi.fn(() => channel)
  channel.emit = (event, table, row) => {
    const payload = event === 'DELETE' ? { old: row } : { new: row }
    for (const callback of handlers.get(`${event}:${table}`) ?? []) callback(payload)
  }
  return channel
}

afterEach(cleanup)

function MemberNames() {
  const { allMembers } = useFamilyMembersData()
  return createElement('span', { 'data-testid': 'names' }, allMembers.map((m) => m.display_name).join(', '))
}

describe('FamilyMembersContext realtime', () => {
  it('shows a new member as soon as their row is inserted, with no manual refresh', async () => {
    const channel = makeFakeChannel()
    channelMock.mockReturnValue(channel)

    render(createElement(FamilyMembersProvider, { familyId: 'family-1', children: createElement(MemberNames) }))
    expect(screen.getByTestId('names').textContent).toBe('Alex')

    const newChild: FamilyMember = {
      id: 'm2', family_id: 'family-1', display_name: 'Sam', role: 'child', user_id: null, birth_date: null,
      color_key: null, avatar_path: null, avatar_url: null, grammatical_gender: null, vocative_name: null, status: 'active',
    }

    await act(async () => {
      channel.emit('INSERT', 'members', newChild)
      // avatar signing (skipped here since avatar_path is null) still runs
      // through a microtask before setMembers is called.
      await Promise.resolve()
    })

    expect(screen.getByTestId('names').textContent).toBe('Alex, Sam')
  })
})
