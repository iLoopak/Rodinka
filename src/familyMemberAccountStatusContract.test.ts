import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { strings } from './strings'

const migrationSql = readFileSync(
  new URL('../supabase/migrations/20260720110000_family_member_emails.sql', import.meta.url),
  'utf8',
)
const familyScreen = readFileSync(new URL('./components/FamilyScreen.tsx', import.meta.url), 'utf8')
const memberProfileModal = readFileSync(
  new URL('./components/family/MemberProfileModal.tsx', import.meta.url),
  'utf8',
)

// The account-link status must reflect the real tie to an authenticated user
// (members.user_id / a linked auth.users row), never the role, name, or mere
// existence of a member profile.
describe('family member account status', () => {
  it('reads adult emails through a guarded security-definer RPC, not a public table', () => {
    expect(migrationSql).toContain('create or replace function public.family_member_emails')
    expect(migrationSql).toContain('security definer')
    // Only active adults of the same family may read; children/outsiders get
    // an empty result rather than an error.
    expect(migrationSql).toContain('public.is_active_family_adult(p_family_id)')
    expect(migrationSql).toContain("m.role in ('admin', 'parent')")
    expect(migrationSql).toContain("coalesce(m.status, 'active') = 'active'")
    // Members without a linked auth user are dropped by the inner join.
    expect(migrationSql).toContain('join auth.users u on u.id = m.user_id')
    // auth.users is never exposed publicly.
    expect(migrationSql).toContain('revoke all on function public.family_member_emails(uuid) from public, anon')
    expect(migrationSql).toContain('grant execute on function public.family_member_emails(uuid) to authenticated')
  })

  it('derives the adult account state from members.user_id in the overview', () => {
    expect(familyScreen).toContain('member.user_id ? t.family.accountLinked : t.family.emailNoAccount')
    // No empty email / misleading placeholder in the overview: the email line
    // only renders when a real linked email is present.
    expect(familyScreen).toContain('m.role !== \'child\' && memberEmails.get(m.id) && (')
    expect(familyScreen).not.toContain('family-member-email is-empty')
  })

  it('shows the login email plus a linked status, or a no-account state with a hint, in the profile', () => {
    expect(memberProfileModal).toContain('t.family.accountLinked')
    expect(memberProfileModal).toContain('t.family.emailNoAccount')
    expect(memberProfileModal).toContain('t.family.noAccountHint')
    // Status branch keys off the authenticated-account link.
    expect(memberProfileModal).toContain('member.user_id ? (')
  })

  it('provides neutral, non-error account-status copy in both languages', () => {
    expect(strings.cs.family.accountLinked).toBe('Propojený účet')
    expect(strings.cs.family.emailNoAccount).toBe('Bez propojeného účtu')
    expect(strings.cs.family.noAccountHint).toBe('Tento člen zatím nemá vlastní přístup do aplikace.')
    expect(strings.en.family.accountLinked).toBe('Connected account')
    expect(strings.en.family.emailNoAccount).toBe('No account connected')
    expect(strings.en.family.noAccountHint).toBe("This member doesn't have their own access to the app yet.")
  })
})
