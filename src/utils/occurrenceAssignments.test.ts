import { describe, expect, it } from 'vitest'
import { eligibleOccurrenceMembers, getEffectiveActivityParticipants, getEffectiveOccurrenceMember, type OccurrenceOverride } from './occurrenceAssignments'

const override: OccurrenceOverride = {
  id: 'override-1', family_id: 'family-1', series_type: 'activity', series_id: 'series-1',
  occurrence_date: '2026-07-21', companion_member_id: 'adult-2', assignee_member_id: null,
  cancelled: false, updated_at: '2026-07-14T10:00:00Z',
}

describe('occurrence assignment resolution', () => {
  it('uses a series default when no occurrence override exists', () => {
    expect(getEffectiveOccurrenceMember({ seriesType: 'activity', seriesId: 'series-1', occurrenceDate: '2026-07-14', defaultMemberId: 'adult-1', overrides: [] }))
      .toEqual({ memberId: 'adult-1', isOverride: false, overrideId: null })
  })

  it('changes one occurrence without changing adjacent occurrences', () => {
    expect(getEffectiveOccurrenceMember({ seriesType: 'activity', seriesId: 'series-1', occurrenceDate: '2026-07-21', defaultMemberId: 'adult-1', overrides: [override] }).memberId).toBe('adult-2')
    expect(getEffectiveOccurrenceMember({ seriesType: 'activity', seriesId: 'series-1', occurrenceDate: '2026-07-28', defaultMemberId: 'adult-1', overrides: [override] }).memberId).toBe('adult-1')
  })

  it('preserves an explicit override after the series default changes', () => {
    const result = getEffectiveOccurrenceMember({ seriesType: 'activity', seriesId: 'series-1', occurrenceDate: '2026-07-21', defaultMemberId: 'adult-3', overrides: [override] })
    expect(result).toMatchObject({ memberId: 'adult-2', isOverride: true })
  })

  it('uses assignment history for past occurrences', () => {
    const result = getEffectiveOccurrenceMember({
      seriesType: 'task', seriesId: 'task-1', occurrenceDate: '2026-07-07', defaultMemberId: 'adult-2', overrides: [],
      assignmentHistory: [
        { id: 'h1', family_id: 'family-1', series_type: 'task', series_id: 'task-1', effective_from: '2026-07-01', member_id: 'adult-1' },
        { id: 'h2', family_id: 'family-1', series_type: 'task', series_id: 'task-1', effective_from: '2026-07-14', member_id: 'adult-2' },
      ],
    })
    expect(result.memberId).toBe('adult-1')
  })

  it('excludes removed members and children from companion choices', () => {
    const members = [
      { id: 'adult', role: 'parent', status: 'active' },
      { id: 'child', role: 'child', status: 'active' },
      { id: 'removed', role: 'parent', status: 'removed' },
    ]
    expect(eligibleOccurrenceMembers(members, 'activity').map((member) => member.id)).toEqual(['adult'])
    expect(eligibleOccurrenceMembers(members, 'task').map((member) => member.id)).toEqual(['adult', 'child'])
  })

  it('resolves historical participants without keeping them in future occurrences', () => {
    const history = [{ id: 'p1', family_id: 'family-1', activity_id: 'series-1', member_id: 'removed', effective_from: '2026-01-01', effective_to: '2026-07-13' }]
    expect(getEffectiveActivityParticipants('series-1', '2026-07-01', [], history)).toEqual(['removed'])
    expect(getEffectiveActivityParticipants('series-1', '2026-07-21', [], history)).toEqual([])
  })
})
