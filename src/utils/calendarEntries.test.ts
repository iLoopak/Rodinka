import { describe, expect, it } from 'vitest'
import { buildCalendarEntries, deduplicateAgendaRanges, entryMatchesMember, groupEntriesForAgenda } from './calendarEntries'
import { makeActivity, makeChore, makeMealPlanEntry, makeMedicalRecord } from './testFixtures'

const RANGE_START = '2026-07-01'
const RANGE_END = '2026-07-31'

describe('buildCalendarEntries — chores', () => {
  it('projects a chore on its due_date when within range', () => {
    const chore = makeChore({ due_date: '2026-07-15' })
    const entries = buildCalendarEntries({
      chores: [chore],
      activities: [],
      medicalRecords: [],
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    })
    expect(entries).toEqual([
      expect.objectContaining({ id: `chore:${chore.id}`, type: 'chore', date: '2026-07-15', sourceType: 'chore' }),
    ])
  })

  it('excludes chores due outside the range', () => {
    const chore = makeChore({ due_date: '2026-08-01' })
    const entries = buildCalendarEntries({
      chores: [chore],
      activities: [],
      medicalRecords: [],
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    })
    expect(entries).toEqual([])
  })
})

describe('buildCalendarEntries — activities', () => {
  it('projects recurring occurrences and a separate payment entry', () => {
    const activity = makeActivity({
      id: 'act-1',
      title: 'Swimming',
      recurrence_type: 'weekly',
      start_date: '2026-07-01',
      child_id: 'child-1',
      responsible_member_id: 'parent-1',
      next_payment_due_date: '2026-07-20',
    })
    const entries = buildCalendarEntries({
      chores: [],
      activities: [activity],
      medicalRecords: [],
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    })

    const occurrenceEntries = entries.filter((e) => e.sourceType === 'activity')
    expect(occurrenceEntries.map((e) => e.date)).toEqual(['2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29'])
    expect(occurrenceEntries[0]).toMatchObject({
      type: 'activity',
      childOrPatientId: 'child-1',
      responsibleMemberId: 'parent-1',
      recurrenceLabel: 'Každý týden ve středu',
    })

    const paymentEntries = entries.filter((e) => e.sourceType === 'activity_payment')
    expect(paymentEntries).toHaveLength(1)
    expect(paymentEntries[0]).toMatchObject({ type: 'payment', date: '2026-07-20', title: 'Platba – Swimming' })
  })

  it('shows an occurrence companion override only on its matching date', () => {
    const activity = makeActivity({ id: 'act-override', recurrence_type: 'weekly', start_date: '2026-07-01', responsible_member_id: 'parent-1' })
    const entries = buildCalendarEntries({
      chores: [], activities: [activity], medicalRecords: [], rangeStart: RANGE_START, rangeEnd: RANGE_END,
      occurrenceOverrides: [{
        id: 'override-1', family_id: activity.family_id, series_type: 'activity', series_id: activity.id,
        occurrence_date: '2026-07-15', companion_member_id: 'parent-2', assignee_member_id: null,
        cancelled: false, updated_at: '2026-07-14T10:00:00Z',
      }],
    }).filter((entry) => entry.sourceType === 'activity')
    expect(entries.find((entry) => entry.date === '2026-07-15')).toMatchObject({ responsibleMemberId: 'parent-2', assignmentOverridden: true })
    expect(entries.find((entry) => entry.date === '2026-07-22')).toMatchObject({ responsibleMemberId: 'parent-1', assignmentOverridden: false })
  })

  it('omits occurrences for paused activities', () => {
    const activity = makeActivity({ recurrence_type: 'weekly', status: 'paused', start_date: '2026-07-01' })
    const entries = buildCalendarEntries({
      chores: [],
      activities: [activity],
      medicalRecords: [],
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    })
    expect(entries.filter((e) => e.sourceType === 'activity')).toEqual([])
  })

  it('carries all participants and emits one agenda row for a multi-day event', () => {
    const activity = makeActivity({
      kind: 'event', all_day: true, participant_ids: ['child-1', 'parent-1'],
      start_date: '2026-07-18', end_date: '2026-07-25', recurrence_type: 'one_off',
      responsible_member_id: 'parent-2',
    })
    const entries = buildCalendarEntries({ chores: [], activities: [activity], medicalRecords: [], rangeStart: RANGE_START, rangeEnd: RANGE_END })
    expect(entries.filter((entry) => entry.sourceType === 'activity')).toHaveLength(8)
    expect(entries[0]).toMatchObject({ participantMemberIds: ['child-1', 'parent-1'], isMultiDay: true, time: null })
    expect(deduplicateAgendaRanges(entries)).toHaveLength(1)
    expect(entryMatchesMember(entries[0], 'parent-1')).toBe(true)
    expect(entryMatchesMember(entries[0], 'parent-2')).toBe(true)
    expect(entryMatchesMember(entries[0], 'absent')).toBe(false)
  })
})

describe('buildCalendarEntries — medical records', () => {
  it('projects the appointment date and a separate next-due-date entry', () => {
    const record = makeMedicalRecord({
      id: 'med-1',
      title: 'Checkup',
      record_date: '2026-07-05',
      next_due_date: '2026-07-25',
      patient_id: 'child-1',
    })
    const entries = buildCalendarEntries({
      chores: [],
      activities: [],
      medicalRecords: [record],
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    })

    expect(entries).toHaveLength(2)
    expect(entries.find((e) => e.sourceType === 'medical')).toMatchObject({ type: 'medical', date: '2026-07-05' })
    expect(entries.find((e) => e.sourceType === 'medical_due')).toMatchObject({
      type: 'medical',
      date: '2026-07-25',
      title: 'Termín – Checkup',
    })
  })

  it('classifies vaccination records under the vaccination type and uses vaccine_next_dose_date', () => {
    const record = makeMedicalRecord({
      record_type: 'vaccination',
      record_date: '2026-07-05',
      vaccine_next_dose_date: '2026-07-28',
    })
    const entries = buildCalendarEntries({
      chores: [],
      activities: [],
      medicalRecords: [record],
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    })
    expect(entries.every((e) => e.type === 'vaccination')).toBe(true)
    expect(entries.find((e) => e.sourceType === 'medical_due')?.date).toBe('2026-07-28')
  })
})

describe('buildCalendarEntries — meal plan entries', () => {
  it('projects confirmed and completed entries as the "meal" type', () => {
    const entries = buildCalendarEntries({
      chores: [],
      activities: [],
      medicalRecords: [],
      mealPlanEntries: [
        makeMealPlanEntry({ id: 'a', status: 'confirmed', entry_date: '2026-07-15', title: 'Pizza' }),
        makeMealPlanEntry({ id: 'b', status: 'completed', entry_date: '2026-07-16', title: 'Soup' }),
      ],
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    })
    expect(entries).toHaveLength(2)
    expect(entries.every((e) => e.type === 'meal' && e.sourceType === 'meal')).toBe(true)
    expect(entries.map((e) => e.title)).toEqual(['Pizza', 'Soup'])
    expect(entries.map((e) => e.mealSlot)).toEqual(['dinner', 'dinner'])
  })

  it('excludes proposed and skipped entries to avoid cluttering the calendar', () => {
    const entries = buildCalendarEntries({
      chores: [],
      activities: [],
      medicalRecords: [],
      mealPlanEntries: [
        makeMealPlanEntry({ status: 'proposed', entry_date: '2026-07-15' }),
        makeMealPlanEntry({ status: 'skipped', entry_date: '2026-07-16' }),
      ],
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    })
    expect(entries).toEqual([])
  })

  it('defaults to no meal entries when mealPlanEntries is omitted (backward compatible)', () => {
    const entries = buildCalendarEntries({
      chores: [makeChore({ due_date: '2026-07-15' })],
      activities: [],
      medicalRecords: [],
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
    })
    expect(entries.every((e) => e.type !== 'meal')).toBe(true)
  })
})

describe('groupEntriesForAgenda', () => {
  it('buckets entries into overdue/today/tomorrow/thisWeek/later', () => {
    const today = '2026-07-13'
    const entries = buildCalendarEntries({
      chores: [
        makeChore({ id: 'overdue', due_date: '2026-07-10' }),
        makeChore({ id: 'today', due_date: today }),
        makeChore({ id: 'tomorrow', due_date: '2026-07-14' }),
        makeChore({ id: 'this-week', due_date: '2026-07-17' }),
        makeChore({ id: 'later', due_date: '2026-07-25' }),
      ],
      activities: [],
      medicalRecords: [],
      rangeStart: '2026-07-01',
      rangeEnd: '2026-07-31',
    })

    const groups = groupEntriesForAgenda(entries, today)
    const buckets = Object.fromEntries(groups.map((g) => [g.bucket, g.entries.map((e) => e.sourceId)]))

    expect(buckets.overdue).toEqual(['overdue'])
    expect(buckets.today).toEqual(['today'])
    expect(buckets.tomorrow).toEqual(['tomorrow'])
    expect(buckets.thisWeek).toEqual(['this-week'])
    expect(buckets.upcoming).toEqual(['later'])
    expect(groups.map((g) => g.bucket)).toEqual(['overdue', 'today', 'tomorrow', 'thisWeek', 'upcoming'])
  })

  it('omits empty buckets entirely', () => {
    const entries = buildCalendarEntries({
      chores: [makeChore({ due_date: '2026-07-13' })],
      activities: [],
      medicalRecords: [],
      rangeStart: '2026-07-01',
      rangeEnd: '2026-07-31',
    })
    const groups = groupEntriesForAgenda(entries, '2026-07-13')
    expect(groups).toHaveLength(1)
    expect(groups[0].bucket).toBe('today')
  })
})
