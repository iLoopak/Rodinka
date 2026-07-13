import { describe, expect, it } from 'vitest'
import { buildCalendarEntries, groupEntriesForAgenda } from './calendarEntries'
import { makeActivity, makeChore, makeMedicalRecord } from './testFixtures'

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
    })

    const paymentEntries = entries.filter((e) => e.sourceType === 'activity_payment')
    expect(paymentEntries).toHaveLength(1)
    expect(paymentEntries[0]).toMatchObject({ type: 'payment', date: '2026-07-20', title: 'Platba – Swimming' })
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
