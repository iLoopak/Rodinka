import { describe, expect, it } from 'vitest'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import type { ChildAccount } from '../hooks/useChildAccounts'
import { canManageChildAccount, canViewChildAccountDetails, childAccountState } from './childAccountStatus'

const child: FamilyMember = {
  id: 'child-1', family_id: 'family-1', display_name: 'Alex', role: 'child', user_id: null,
  birth_date: null, color_key: null, avatar_path: null, avatar_url: null,
  grammatical_gender: null, vocative_name: null, status: 'active',
}
const parent = { id: 'parent-1', family_id: 'family-1', role: 'parent' as const, status: 'active' as const }
const account = (overrides: Partial<ChildAccount>): ChildAccount => ({
  member_id: 'child-1', login_name: 'alex', status: 'active',
  activated_at: '2026-07-01T10:00:00Z', password_reset_at: null, revoked_at: null, ...overrides,
})

describe('childAccountState', () => {
  it('reports no account for a child that was never provisioned', () => {
    expect(childAccountState(child, null)).toBe('none')
  })

  it('reports active only once the member carries the auth link', () => {
    expect(childAccountState({ ...child, user_id: 'auth-1' }, account({}))).toBe('active')
  })

  it('reports revoked when access is detached even if the account row is stale', () => {
    // members.user_id is canonical. A detach that has not yet been reconciled
    // into child_accounts must not keep showing the child as able to sign in.
    expect(childAccountState({ ...child, user_id: null }, account({ status: 'active' }))).toBe('revoked')
  })

  it('reports revoked after revocation', () => {
    expect(childAccountState(child, account({ status: 'revoked', revoked_at: '2026-07-10T10:00:00Z' }))).toBe('revoked')
  })

  it('reports a provisioning reservation as in-progress', () => {
    expect(childAccountState(child, account({ status: 'provisioning' }))).toBe('provisioning')
  })

  it('never treats an adult as having a managed account', () => {
    const adult: FamilyMember = { ...child, id: 'parent-1', role: 'parent', user_id: 'auth-2' }
    expect(childAccountState(adult, null)).toBe('none')
  })
})

describe('canManageChildAccount', () => {
  it('allows an active adult in the same family', () => {
    expect(canManageChildAccount(parent, child)).toBe(true)
    expect(canManageChildAccount({ ...parent, role: 'admin' }, child)).toBe(true)
  })

  it('rejects a child actor', () => {
    expect(canManageChildAccount({ ...parent, role: 'child' }, child)).toBe(false)
  })

  it('rejects an adult from another family', () => {
    expect(canManageChildAccount({ ...parent, family_id: 'family-2' }, child)).toBe(false)
  })

  it('rejects a removed adult', () => {
    expect(canManageChildAccount({ ...parent, status: 'removed' }, child)).toBe(false)
  })

  it('rejects managing a removed child', () => {
    expect(canManageChildAccount(parent, { ...child, status: 'removed' })).toBe(false)
  })

  it('rejects targeting an adult', () => {
    expect(canManageChildAccount(parent, { ...child, role: 'parent' })).toBe(false)
  })

  it('rejects a missing actor', () => {
    expect(canManageChildAccount(null, child)).toBe(false)
  })
})

describe('canViewChildAccountDetails', () => {
  it('lets a child see their own account details', () => {
    expect(canViewChildAccountDetails({ id: 'child-1', family_id: 'family-1', role: 'child', status: 'active' }, child)).toBe(true)
  })

  it('does not let a child see a sibling account', () => {
    expect(canViewChildAccountDetails({ id: 'child-2', family_id: 'family-1', role: 'child', status: 'active' }, child)).toBe(false)
  })
})
