import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { strings } from './strings'
import { getLocalizedAddressName } from './utils/personalizedName'

const root = process.cwd()
const migration = readFileSync(join(root, 'supabase/migrations/20260714150000_member_vocative_name.sql'), 'utf8')
const profile = readFileSync(join(root, 'src/components/family/MemberProfileModal.tsx'), 'utf8')
const shell = readFileSync(join(root, 'src/components/AppShell.tsx'), 'utf8')
const familyContext = readFileSync(join(root, 'src/context/FamilyDataContext.tsx'), 'utf8')
const familyScreen = readFileSync(join(root, 'src/components/FamilyScreen.tsx'), 'utf8')
const familyMarkHook = readFileSync(join(root, 'src/hooks/useActiveFamilyMark.ts'), 'utf8')

describe('personalization persistence and UI contracts', () => {
  it('adds a nullable manual override without requiring a backfill', () => {
    expect(migration).toContain('add column if not exists vocative_name text')
    expect(migration).not.toMatch(/update members\s+set vocative_name/)
    expect(migration).toContain("nullif(regexp_replace(btrim(coalesce(p_vocative_name, ''))")
  })

  it('passes the override through the protected profile RPC and allows clearing it', () => {
    expect(migration).toContain('p_vocative_name text')
    expect(migration).toContain('vocative_name = v_vocative_name')
    expect(migration).not.toContain('drop function if exists update_member_profile')
    expect(profile).toContain('vocativeName: vocativeName || null')
    expect(profile).toContain('t.family.vocativePreview')
  })

  it('loads the shared brand from the active family context', () => {
    expect(shell).toContain('useFamilyData()')
    expect(shell).toContain('members={familyMark.members}')
    expect(shell).toContain('loading={familyNameLoading}')
    expect(shell).toContain('markLoading={familyMark.loading}')
    expect(familyMarkHook).toContain('member.family_id === familyId')
    expect(familyMarkHook).toContain('scopedMembers.length > 0 ? scopedMembers : currentMember ? [currentMember] : []')
  })

  it('updates the shared source immediately after an admin family rename', () => {
    expect(familyScreen).toContain('await updateFamilyName(familyNameDraft)')
    expect(familyContext).toContain("supabase.from('families').update({ name: normalized })")
    expect(familyContext).toContain('setFamilyNameState((current) => ({ ...current, familyId, name: normalized, loading: false }))')
    expect(familyContext).toContain('familyNameState.familyId === familyId')
  })

  it('uses vocative only in Czech direct greetings and keeps a natural generic fallback', () => {
    const czech = getLocalizedAddressName({ firstName: 'Lukáš', manualVocative: null, locale: 'cs' })
    const english = getLocalizedAddressName({ firstName: 'Lukáš', manualVocative: null, locale: 'en' })
    expect(strings.cs.home.welcome(czech)).toBe('Vítejte, Lukáši.')
    expect(strings.en.home.welcome(english)).toBe('Welcome, Lukáš.')
    expect(strings.cs.home.welcome(null)).toBe('Vítejte.')
    expect(strings.en.home.welcome('')).toBe('Welcome.')
  })
})
