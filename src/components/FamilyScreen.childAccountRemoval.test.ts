// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../strings'
import type { FamilyMember } from '../hooks/useFamilyMembers'

const admin: FamilyMember = { id: 'admin-1', family_id: 'family-1', display_name: 'Anna', role: 'admin', user_id: 'auth-admin', birth_date: null, color_key: null, avatar_path: null, avatar_url: null, grammatical_gender: null, vocative_name: null, status: 'active' }
const linkedChild: FamilyMember = { id: 'child-1', family_id: 'family-1', display_name: 'Alex', role: 'child', user_id: 'auth-child', birth_date: null, color_key: null, avatar_path: null, avatar_url: null, grammatical_gender: null, vocative_name: null, status: 'active' }
const unlinkedChild: FamilyMember = { ...linkedChild, id: 'child-2', display_name: 'Bára', user_id: null }

const calls: string[] = []
const invoke = vi.fn(async () => { calls.push('revoke'); return { data: { ok: true, status: 'revoked', cleanupPending: false }, error: null } })
const removeMember = vi.fn(async () => { calls.push('remove') })

vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
    functions: { invoke: (...args: unknown[]) => invoke(...(args as [])) },
    storage: { from: vi.fn() },
    auth: { signOut: vi.fn() },
  },
}))
vi.mock('../context/family/FamilyCoreContext', () => ({
  useFamilyCore: () => ({ currentMember: admin, isParentOrAdmin: true, userEmail: 'anna@example.test' }),
}))
vi.mock('../context/family/FamilyMembersContext', () => ({
  useFamilyMembersData: () => ({
    members: [admin, linkedChild, unlinkedChild], allMembers: [admin, linkedChild, unlinkedChild], kids: [linkedChild, unlinkedChild],
    addChild: vi.fn(), createInvite: vi.fn(), removeMember, leaveHousehold: vi.fn(), restoreMember: vi.fn(),
    permanentlyDeleteRemovedMember: vi.fn(), membersLoading: false, membersError: null,
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

import { FamilyScreen } from './FamilyScreen'

async function startRemoval(childName: string) {
  render(createElement(FamilyScreen))
  fireEvent.click(screen.getByRole('button', { name: `${t.family.editProfile}: ${childName}` }))
  fireEvent.click(screen.getByRole('button', { name: t.family.removeMemberAction }))
  const confirm = await screen.findByRole('button', { name: t.family.removeMemberAction })
  fireEvent.click(confirm)
}

describe('FamilyScreen child removal and account revocation', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    calls.length = 0
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  })

  it('revokes a linked child account before removing the member', async () => {
    await startRemoval('Alex')
    await waitFor(() => expect(removeMember).toHaveBeenCalled())
    // Only the Edge Function can delete the orphaned Auth user, and it must
    // run while the member row still carries the link.
    expect(calls).toEqual(['revoke', 'remove'])
    expect(invoke).toHaveBeenCalledWith('manage-child-account', { body: { action: 'revoke', memberId: 'child-1' } })
  })

  it('does not call the account API for a child that never had access', async () => {
    await startRemoval('Bára')
    await waitFor(() => expect(removeMember).toHaveBeenCalled())
    expect(invoke).not.toHaveBeenCalled()
    expect(calls).toEqual(['remove'])
  })

  it('still removes the member when Auth cleanup fails', async () => {
    invoke.mockRejectedValueOnce(new Error('edge unavailable'))
    await startRemoval('Alex')
    // remove_household_member detaches user_id and revokes push on its own, so
    // an unreachable Edge Function must not block the removal itself.
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('child-1', null, 'unassign', 'clear'))
  })
})
