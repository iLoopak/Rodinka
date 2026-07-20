import { describe, expect, it } from 'vitest'
import { ActivitiesError, toActivitiesError } from './activityErrors'

describe('activities error mapping', () => {
  it('normalises a permission failure without carrying the Postgres text', () => {
    const error = toActivitiesError('activities.list', { code: '42501', message: 'permission denied for table activities' })
    expect(error).toBeInstanceOf(ActivitiesError)
    expect(error.code).toBe('permission-denied')
    expect(error.retryable).toBe(false)
    // The UI renders from the code; the original text stays on `cause` for a
    // developer console only.
    expect(error.message).not.toContain('permission denied for table')
    expect(error.operation).toBe('activities.list')
  })

  it('treats a stale override as a conflict, not a missing row', () => {
    // The occurrence moved on while the sheet was open. Telling the user
    // "not found" invites a retry that will fail the same way; they need
    // fresh data.
    const error = toActivitiesError('occurrences.setMemberOverride', { code: 'PGRST116', message: 'no rows' })
    expect(error.code).toBe('conflict')
    expect(error.retryable).toBe(false)
  })

  it('treats a member who left the family as a conflict on the override path', () => {
    const error = toActivitiesError('occurrences.setMemberOverride', {
      code: 'P0001', message: 'member is no longer part of this family',
    })
    expect(error.code).toBe('conflict')
  })

  it('leaves the same not-found alone on other operations', () => {
    // The refinement is specific to the override RPC; a genuinely missing
    // activity is still not-found.
    expect(toActivitiesError('activities.get', { code: 'PGRST116', message: 'no rows' }).code).toBe('not-found')
  })

  it('keeps a transport failure retryable', () => {
    const error = toActivitiesError('activities.list', new TypeError('Failed to fetch'))
    expect(error.retryable).toBe(true)
  })

  it('does not re-wrap an error it already produced', () => {
    const first = toActivitiesError('activities.list', new Error('boom'))
    expect(toActivitiesError('activities.updateSeries', first)).toBe(first)
  })
})
