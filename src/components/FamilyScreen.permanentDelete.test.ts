// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../strings'
import type { FamilyMember } from '../hooks/useFamilyMembers'

const active: FamilyMember = { id: 'active', family_id: 'family', display_name: 'Active Anna', role: 'admin', user_id: 'user', birth_date: null, color_key: null, avatar_path: null, avatar_url: null, grammatical_gender: null, vocative_name: null, status: 'active' }
const removed: FamilyMember = { id: 'removed', family_id: 'family', display_name: 'Testovací Viktor', role: 'child', user_id: null, birth_date: null, color_key: null, avatar_path: 'avatars/viktor.webp', avatar_url: null, grammatical_gender: null, vocative_name: null, status: 'removed' }

const permanentlyDeleteRemovedMember = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    // The screen loads child_accounts for the account badges.
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn() },
    auth: { signOut: vi.fn() },
  },
}))
const restoreMember = vi.fn()

vi.mock('../context/family/FamilyCoreContext', () => ({
  useFamilyCore: () => ({ currentMember: active, isParentOrAdmin: true, userEmail: 'admin@example.test' }),
}))
vi.mock('../context/family/FamilyMembersContext', () => ({
  useFamilyMembersData: () => ({
    members: [active], allMembers: [active, removed], kids: [], addChild: vi.fn(), createInvite: vi.fn(), removeMember: vi.fn(),
    leaveHousehold: vi.fn(), restoreMember, permanentlyDeleteRemovedMember, membersLoading: false, membersError: null,
    refreshMembers: vi.fn(), memberById: vi.fn(), memberName: vi.fn(), membersRealtimeStatus: 'connected',
  }),
}))
vi.mock('../context/family/FamilySettingsContext', () => ({
  useFamilySettings: () => ({ familyName: 'Rodinka', familyNameLoading: false, familyNameError: null, updateFamilyName: vi.fn() }),
}))
vi.mock('../context/chores/ChoresContext', () => ({ useChoresData: () => ({ chores: [], refreshChores: vi.fn() }) }))
vi.mock('../context/activities/ActivitiesContext', () => ({ useActivitiesData: () => ({ activities: [], refreshActivities: vi.fn() }) }))
vi.mock('../context/activities/OccurrenceAssignmentsContext', () => ({ useOccurrenceAssignmentsData: () => ({ refreshOccurrenceAssignments: vi.fn() }) }))
vi.mock('./ui/MemberAvatar', () => ({ MemberAvatar: ({ member }: { member: FamilyMember }) => createElement('span', null, member.display_name.slice(0, 1)) }))
vi.mock('../router', () => ({
  Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string; className?: string }) =>
    createElement('a', { href: to, ...props }, children),
}))

import { FamilyScreen } from './FamilyScreen'

describe('FamilyScreen permanent member deletion', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    permanentlyDeleteRemovedMember.mockResolvedValue(undefined)
  })

  it('shows permanent delete only for removed members and requires confirmation', () => {
    render(createElement(FamilyScreen))
    expect(screen.getByText('Active Anna')).toBeTruthy()
    expect(screen.getByText('Testovací Viktor')).toBeTruthy()
    const deleteButton = screen.getByRole('button', { name: t.family.permanentDeleteAction })
    expect(deleteButton).toBeTruthy()
    expect(screen.getByRole('button', { name: t.family.restoreMemberAction })).toBeTruthy()
    expect(permanentlyDeleteRemovedMember).not.toHaveBeenCalled()
    fireEvent.click(deleteButton)
    expect(screen.getByText(t.family.permanentDeleteConfirmTitle('Testovací Viktor'))).toBeTruthy()
    expect(permanentlyDeleteRemovedMember).not.toHaveBeenCalled()
  })

  it('disables permanent deletion while offline', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    render(createElement(FamilyScreen))
    expect((screen.getByRole('button', { name: t.family.permanentDeleteOffline }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('deletes an unused removed member after confirmation', async () => {
    render(createElement(FamilyScreen))
    fireEvent.click(screen.getAllByRole('button', { name: t.family.permanentDeleteAction })[0])
    fireEvent.click(screen.getAllByRole('button', { name: t.family.permanentDeleteConfirmAction }).at(-1)!)
    await screen.findByText(t.family.permanentDeleteSuccess('Testovací Viktor'))
    expect(permanentlyDeleteRemovedMember).toHaveBeenCalledWith('removed')
  })

  it('shows localized blocker for unsafe active references', async () => {
    permanentlyDeleteRemovedMember.mockRejectedValueOnce(new Error('Unsafe active references remain for this member'))
    render(createElement(FamilyScreen))
    fireEvent.click(screen.getAllByRole('button', { name: t.family.permanentDeleteAction })[0])
    fireEvent.click(screen.getAllByRole('button', { name: t.family.permanentDeleteConfirmAction }).at(-1)!)
    expect((await screen.findByRole('alert')).textContent).toBe(t.family.permanentDeleteUnsafeReferences)
  })
})
