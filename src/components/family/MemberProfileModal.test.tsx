// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import type { ChildAccount } from '../../hooks/useChildAccounts'

const saveMemberProfile = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../../hooks/useMemberProfiles', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useMemberProfiles')>('../../hooks/useMemberProfiles')
  return {
    ...actual,
    useMemberProfiles: () => ({ saveMemberProfile }),
  }
})

vi.mock('../../supabaseClient', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
vi.mock('../../context/chores/AllowanceContext', () => ({
  useAllowanceData: () => ({
    allowancePlans: [],
    allowanceLoading: false,
    allowanceError: null,
    saveAllowancePlan: vi.fn(),
    deleteAllowancePlan: vi.fn(),
  }),
}))
vi.mock('../../context/chores/ChoresContext', () => ({ useChoresData: () => ({ chores: [] }) }))
vi.mock('../ui/MemberAvatar', () => ({
  MemberAvatar: ({ member }: { member: FamilyMember | null }) =>
    <span data-testid="member-avatar">{member?.display_name ?? ''}</span>,
}))

import { MemberProfileModal } from './MemberProfileModal'

const admin: FamilyMember = {
  id: 'admin-1', family_id: 'family-1', display_name: 'Anna', role: 'admin', user_id: 'auth-admin',
  birth_date: null, color_key: 'coral', avatar_path: null, avatar_url: null,
  grammatical_gender: null, vocative_name: null, status: 'active',
}
const parentSelf: FamilyMember = { ...admin, id: 'parent-1', role: 'parent', display_name: 'Petr', user_id: 'auth-parent' }
const child: FamilyMember = {
  id: 'child-1', family_id: 'family-1', display_name: 'Alex', role: 'child', user_id: null,
  birth_date: null, color_key: 'mint', avatar_path: null, avatar_url: null,
  grammatical_gender: null, vocative_name: null, status: 'active',
}
const childWithLogin: FamilyMember = { ...child, user_id: 'auth-child' }
const activeAccount: ChildAccount = {
  member_id: 'child-1', login_name: 'alex', status: 'active',
  activated_at: '2026-07-01T10:00:00Z', password_reset_at: null, revoked_at: null,
}

const editor = t.family.editor

describe('MemberProfileModal sectioned editor', () => {
  beforeEach(() => {
    saveMemberProfile.mockClear()
  })
  afterEach(cleanup)

  it('renders Profile as the initial section with a footer save action', () => {
    render(<MemberProfileModal
      member={admin}
      currentMember={admin}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />)

    expect(screen.getByLabelText(t.family.nameLabel)).toBeTruthy()
    expect(screen.getByRole('button', { name: t.family.saveProfile })).toBeTruthy()
  })

  it('hides section nav when only Profile is available (child editing own profile)', () => {
    render(<MemberProfileModal
      member={child}
      currentMember={child}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      onClose={vi.fn()}
    />)
    expect(screen.queryByRole('navigation', { name: editor.sectionsLabel })).toBeNull()
    // No allowance/access/other buttons for self-edit
    expect(screen.queryByRole('button', { name: editor.sectionAllowance })).toBeNull()
    expect(screen.queryByRole('button', { name: editor.sectionAccess })).toBeNull()
    expect(screen.queryByRole('button', { name: editor.sectionOther })).toBeNull()
  })

  it('exposes every applicable section when a parent edits a child with login and allowance', () => {
    render(<MemberProfileModal
      member={childWithLogin}
      currentMember={admin}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      childAccount={activeAccount}
      onAccountChanged={vi.fn()}
      onRequestRemove={vi.fn()}
      onClose={vi.fn()}
    />)

    const nav = screen.getByRole('navigation', { name: editor.sectionsLabel })
    expect(within(nav).getByRole('button', { name: editor.sectionProfile })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: editor.sectionAllowance })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: editor.sectionAccess })).toBeTruthy()
    expect(within(nav).getByRole('button', { name: editor.sectionOther })).toBeTruthy()
  })

  it('omits Access when the child has no login and no manager surface is wired', () => {
    render(<MemberProfileModal
      member={child}
      currentMember={admin}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      onRequestRemove={vi.fn()}
      onClose={vi.fn()}
    />)
    const nav = screen.getByRole('navigation', { name: editor.sectionsLabel })
    expect(within(nav).queryByRole('button', { name: editor.sectionAccess })).toBeNull()
  })

  it('switches to another section without discarding pending profile edits', () => {
    render(<MemberProfileModal
      member={childWithLogin}
      currentMember={admin}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      childAccount={activeAccount}
      onAccountChanged={vi.fn()}
      onClose={vi.fn()}
    />)

    const nameInput = screen.getByLabelText(t.family.nameLabel) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alexandr' } })

    // Only the Profile section owns the save action; other sections must not
    // present a floating save button that could mislead the user.
    fireEvent.click(screen.getByRole('button', { name: editor.sectionAllowance }))
    expect(screen.queryByRole('button', { name: t.family.saveProfile })).toBeNull()
    expect(screen.queryByLabelText(t.family.nameLabel)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: editor.sectionProfile }))
    const restored = screen.getByLabelText(t.family.nameLabel) as HTMLInputElement
    expect(restored.value).toBe('Alexandr')
  })

  it('warns before closing when profile changes are unsaved', () => {
    const onClose = vi.fn()
    render(<MemberProfileModal
      member={admin}
      currentMember={admin}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      onClose={onClose}
    />)

    fireEvent.change(screen.getByLabelText(t.family.nameLabel), { target: { value: 'Anička' } })
    fireEvent.click(screen.getByRole('button', { name: t.common.close }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(editor.discardTitle)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: editor.discardConfirm }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes without warning when nothing has changed', () => {
    const onClose = vi.fn()
    render(<MemberProfileModal
      member={admin}
      currentMember={admin}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      onClose={onClose}
    />)

    fireEvent.click(screen.getByRole('button', { name: t.common.close }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(editor.discardTitle)).toBeNull()
  })

  it('shows danger-zone actions inside the Other section only, not next to save', () => {
    const onRequestRemove = vi.fn()
    const onRequestLeave = vi.fn()
    render(<MemberProfileModal
      member={parentSelf}
      currentMember={parentSelf}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      onRequestLeave={onRequestLeave}
      onClose={vi.fn()}
    />)

    // From the Profile section: no dangerous action visible next to the save button.
    expect(screen.queryByRole('button', { name: t.family.leaveHouseholdAction })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: editor.sectionOther }))
    // The main save button is gone; the danger card owns its own action.
    expect(screen.queryByRole('button', { name: t.family.saveProfile })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t.family.leaveHouseholdAction }))
    expect(onRequestLeave).toHaveBeenCalledTimes(1)
    expect(onRequestRemove).not.toHaveBeenCalled()
  })

  it('shows an adult account email with a copy action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<MemberProfileModal
      member={parentSelf}
      currentMember={admin}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      accountEmail="petr@example.com"
      onClose={vi.fn()}
    />)

    expect(screen.getByText('petr@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t.family.copyEmailFor(parentSelf.display_name) }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('petr@example.com'))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: t.family.copyEmailFor(parentSelf.display_name) }).textContent).toBe(t.family.emailCopied)
    )
    vi.unstubAllGlobals()
  })

  it('shows a placeholder when an adult has no connected account email', () => {
    render(<MemberProfileModal
      member={{ ...parentSelf, user_id: null }}
      currentMember={admin}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      accountEmail={null}
      onClose={vi.fn()}
    />)
    expect(screen.getByText(t.family.emailNoAccount)).toBeTruthy()
  })

  it('never renders an email row for a child member', () => {
    render(<MemberProfileModal
      member={childWithLogin}
      currentMember={admin}
      refreshMembers={vi.fn().mockResolvedValue(undefined)}
      childAccount={activeAccount}
      onAccountChanged={vi.fn()}
      accountEmail={null}
      onClose={vi.fn()}
    />)
    expect(screen.queryByText(t.family.emailLabel)).toBeNull()
    expect(screen.queryByText(t.family.emailNoAccount)).toBeNull()
  })

  it('submits profile changes through the shared save mutation', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    render(<MemberProfileModal
      member={admin}
      currentMember={admin}
      refreshMembers={refresh}
      onClose={vi.fn()}
    />)

    fireEvent.change(screen.getByLabelText(t.family.nameLabel), { target: { value: 'Anna Nová' } })
    fireEvent.click(screen.getByRole('button', { name: t.family.saveProfile }))

    // The footer button reuses the profile form via form="member-profile-form",
    // so a click still routes through the form's submit handler and the shared
    // mutation. Wait for the mock to be invoked.
    await vi.waitFor(() => expect(saveMemberProfile).toHaveBeenCalledTimes(1))
    expect(saveMemberProfile.mock.calls[0][1]).toMatchObject({ displayName: 'Anna Nová' })
  })
})
