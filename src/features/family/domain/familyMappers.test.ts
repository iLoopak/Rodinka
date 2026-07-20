import { describe, expect, it } from 'vitest'
import { MEMBER_COLUMNS, mapFamilySettings, mapMember } from './familyMappers'
import { toFamilyError } from './familyErrors'
import { classifyAppError } from '../../../errors/errorCodes'

describe('family mappers', () => {
  it('treats a member with no status as active', () => {
    // One of the four old column lists omitted `status`, so a member loaded
    // through that path read as active whether or not they had been removed.
    expect(mapMember({ id: 'm1' }).status).toBe('active')
    expect(mapMember({ id: 'm1', status: 'removed' }).status).toBe('removed')
  })

  it('never invents an avatar URL from a row', () => {
    // avatar_url is a signed URL, not a column. A row carrying one would mean
    // a stale signature had been persisted somewhere.
    expect(mapMember({ id: 'm1', avatar_path: 'family/m1.jpg' }).avatar_url).toBeNull()
    expect(mapMember({ id: 'm1', avatar_path: 'family/m1.jpg' }, 'https://signed').avatar_url).toBe('https://signed')
  })

  it('normalises empty optional text to null', () => {
    expect(mapMember({ id: 'm1', vocative_name: '' }).vocative_name).toBeNull()
    expect(mapMember({ id: 'm1', birth_date: '' }).birth_date).toBeNull()
  })

  it('carries the removal audit fields through', () => {
    const removed = mapMember({
      id: 'm1', status: 'removed', removed_at: '2026-07-20T10:00:00Z',
      removed_by_member_id: 'm2', removal_reason: 'left',
    })
    expect(removed.removed_at).toBe('2026-07-20T10:00:00Z')
    expect(removed.removed_by_member_id).toBe('m2')
  })

  it('is the single member column list, and it includes status', () => {
    for (const column of ['status', 'removed_at', 'avatar_path', 'vocative_name', 'custom_color']) {
      expect(MEMBER_COLUMNS).toContain(column)
    }
  })

  it('maps family settings without a hero image', () => {
    const settings = mapFamilySettings({ name: 'Novákovi', hero_image_path: null }, null)
    expect(settings.name).toBe('Novákovi')
    expect(settings.heroImagePath).toBeNull()
    expect(settings.heroImageUrl).toBeNull()
  })
})

describe('family error mapping', () => {
  it('reports a spent invite as a conflict rather than a missing row', () => {
    // "Not found" invites a retry with the same dead code; a conflict tells
    // the user to ask for a new one.
    expect(toFamilyError('family.redeemInvite', { code: 'PGRST116', message: 'no rows' }).code).toBe('conflict')
    expect(toFamilyError('family.redeemInvite', { message: 'invite code expired' }).code).toBe('conflict')
  })

  it('treats a guarded role transition as permission denied', () => {
    expect(toFamilyError('family.removeMember', { message: 'cannot remove the last admin' }).code).toBe('permission-denied')
  })

  it('keeps a permission failure non-retryable and free of Postgres text', () => {
    const error = toFamilyError('family.listMembers', { code: '42501', message: 'permission denied for table members' })
    expect(error.code).toBe('permission-denied')
    expect(error.retryable).toBe(false)
    expect(error.message).not.toContain('permission denied for table')
  })

  it('stays classified when it passes back through classifyAppError', () => {
    // The stale-cache guard asks classifyAppError what happened. A wrapped
    // domain error reads `family:family.listMembers:permission-denied`, which
    // matches none of the raw Postgres patterns — without the short-circuit it
    // came back as `unknown`, and unknown is retryable, which is exactly what
    // lets a stale cache serve family data to someone who just lost access.
    const wrapped = toFamilyError('family.listMembers', { code: '42501', message: 'permission denied' })
    expect(classifyAppError(wrapped)).toBe('permission-denied')
  })

  it('does not re-wrap an error it already produced', () => {
    const first = toFamilyError('family.listMembers', new Error('boom'))
    expect(toFamilyError('family.updateSettings', first)).toBe(first)
  })
})
