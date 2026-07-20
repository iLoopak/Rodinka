// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Wave 7. `draftInputs` changes identity whenever ANY of eight source domains
// emits, and the drafts memo used to return a fresh array every time. The sync
// effect depends on that array, so toggling a shopping item fired
// sync_member_reminders plus a full reminders refresh — for a change that
// cannot alter a single reminder.

const rpcCalls = vi.hoisted(() => [] as string[])
const rpcMock = vi.hoisted(() => vi.fn(async (name: string) => {
  rpcCalls.push(name)
  return { data: [], error: null }
}))
const fromMock = vi.hoisted(() => vi.fn(() => {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'upsert', 'update', 'insert', 'delete', 'maybeSingle', 'single']) {
    builder[method] = () => builder
  }
  builder.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve)
  return builder
}))

vi.mock('../supabaseClient', () => ({ supabase: { rpc: rpcMock, from: fromMock } }))
vi.mock('./family/FamilyCoreContext', () => ({
  useFamilyCore: () => ({
    familyId: 'f1',
    currentMember: { id: 'm1', role: 'parent', display_name: 'Tester' },
    userId: 'u1',
    userEmail: 'a@b.c',
    isParentOrAdmin: true,
  }),
}))
vi.mock('../i18n/languageContext', () => ({ useLanguage: () => ({ language: 'cs' }) }))

// The generated drafts depend only on `relevant`; `irrelevant` stands in for
// every domain field that cannot influence a reminder.
const sourceState = vi.hoisted(() => ({ relevant: 'a', irrelevant: 0, loading: false }))
const generated = vi.hoisted(() => ({ count: 0 }))

vi.mock('./reminders/useReminderSources', () => ({
  useReminderSources: () => ({
    loading: sourceState.loading,
    // A new object identity on every render, exactly like the real hook when
    // any upstream domain emits.
    draftInputs: { marker: sourceState.relevant, noise: sourceState.irrelevant },
    refresh: vi.fn(async () => undefined),
  }),
}))

vi.mock('../notifications/reminders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../notifications/reminders')>()
  return {
    ...actual,
    generateReminderDrafts: (input: { marker?: string }) => {
      generated.count += 1
      return [{ id: `draft-${input.marker}`, title: String(input.marker), category: 'chore' }]
    },
  }
})

const { ReminderProvider, useReminders } = await import('./ReminderContext')

function Probe() {
  const { unreadCount } = useReminders()
  return <span data-testid="unread">{unreadCount}</span>
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const syncCalls = () => rpcCalls.filter((name) => name === 'sync_member_reminders').length

beforeEach(() => {
  rpcCalls.length = 0
  generated.count = 0
  sourceState.relevant = 'a'
  sourceState.irrelevant = 0
  sourceState.loading = false
})

afterEach(cleanup)

describe('reminder sync fan-out', () => {
  it('syncs once for the initial drafts', async () => {
    render(<ReminderProvider><Probe /></ReminderProvider>)
    await flush()
    expect(screen.getByTestId('unread')).toBeTruthy()
    expect(syncCalls()).toBe(1)
  })

  it('does not sync again when an unrelated domain change produces identical drafts', async () => {
    const view = render(<ReminderProvider><Probe /></ReminderProvider>)
    await flush()
    const before = syncCalls()

    // A shopping item toggled, a chore renamed — new source identity, same
    // reminders.
    sourceState.irrelevant += 1
    view.rerender(<ReminderProvider><Probe /></ReminderProvider>)
    await flush()

    expect(syncCalls()).toBe(before)
    // Generation still runs; it is cheap. It is the RPC that must not.
    expect(generated.count).toBeGreaterThan(1)
  })

  it('still syncs as soon as the drafts really change', async () => {
    const view = render(<ReminderProvider><Probe /></ReminderProvider>)
    await flush()
    const before = syncCalls()

    sourceState.relevant = 'b'
    view.rerender(<ReminderProvider><Probe /></ReminderProvider>)
    await flush()

    expect(syncCalls()).toBe(before + 1)
  })

  it('does not skip a change that returns the drafts to an earlier value', async () => {
    // Guarding on "did it differ from last time" rather than a set of seen
    // values keeps an A → B → A sequence syncing every step.
    const view = render(<ReminderProvider><Probe /></ReminderProvider>)
    await flush()
    sourceState.relevant = 'b'
    view.rerender(<ReminderProvider><Probe /></ReminderProvider>)
    await flush()
    const afterB = syncCalls()

    sourceState.relevant = 'a'
    view.rerender(<ReminderProvider><Probe /></ReminderProvider>)
    await flush()

    expect(syncCalls()).toBe(afterB + 1)
  })
})
