import { describe, expect, it } from 'vitest'
import type { CalendarEntry } from './calendarEntries'
import { buildTodayAttentionItems, buildTodayEntries, compareTodayEntries, isChildTodayAttentionVisible, isChildTodayEntryVisible } from './todayAgenda'
import {
  makeActivity,
  makeChore,
  makeMealPlanEntry,
  makeMealVote,
  makeMealVoteCandidate,
  makeMedicalRecord,
} from './testFixtures'
import type { MealVoteRound } from '../hooks/useMealVoteRounds'
import type { ChoreCompletion } from '../hooks/useChoreCompletions'

const TODAY = '2026-07-13'
const noCompletion = () => null

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: 'entry',
    type: 'chore',
    date: TODAY,
    time: null,
    title: 'Entry',
    subtitle: null,
    childOrPatientId: null,
    responsibleMemberId: null,
    recurring: false,
    sourceType: 'chore',
    sourceId: 'source',
    ...overrides,
  }
}

describe('compareTodayEntries', () => {
  it('orders timed entries, date-only entries, then meals by slot', () => {
    const entries = [
      entry({ id: 'dinner', type: 'meal', sourceType: 'meal', mealSlot: 'dinner' }),
      entry({ id: 'date-only', title: 'Chore' }),
      entry({ id: 'late', type: 'activity', sourceType: 'activity', time: '16:00' }),
      entry({ id: 'breakfast', type: 'meal', sourceType: 'meal', mealSlot: 'breakfast' }),
      entry({ id: 'early', type: 'medical', sourceType: 'medical', time: '10:30' }),
    ]

    expect(entries.sort(compareTodayEntries).map((item) => item.id)).toEqual([
      'early',
      'late',
      'date-only',
      'breakfast',
      'dinner',
    ])
  })
})

describe('buildTodayEntries', () => {
  it('shows non-chore domains when there are zero chores', () => {
    const entries = buildTodayEntries({
      chores: [],
      activities: [makeActivity({ start_date: TODAY })],
      medicalRecords: [makeMedicalRecord({ record_date: TODAY })],
      mealPlanEntries: [makeMealPlanEntry({ entry_date: TODAY, status: 'confirmed' })],
      latestCompletionFor: noCompletion,
      today: TODAY,
    })

    expect(entries.map((item) => item.type)).toEqual(['activity', 'medical', 'meal'])
  })

  it('returns an empty agenda for a completely empty day', () => {
    expect(
      buildTodayEntries({
        chores: [],
        activities: [],
        medicalRecords: [],
        mealPlanEntries: [],
        latestCompletionFor: noCompletion,
        today: TODAY,
      })
    ).toEqual([])
  })

  it('does not duplicate overdue attention items in today agenda', () => {
    const overdueChore = makeChore({ due_date: '2026-07-12' })
    const agenda = buildTodayEntries({
      chores: [overdueChore],
      activities: [],
      medicalRecords: [],
      mealPlanEntries: [],
      latestCompletionFor: noCompletion,
      today: TODAY,
    })
    const attention = buildTodayAttentionItems({
      chores: [overdueChore],
      activities: [],
      medicalRecords: [],
      voteRounds: [],
      currentMemberId: 'member-1',
      latestCompletionFor: noCompletion,
      today: TODAY,
    })

    expect(agenda).toEqual([])
    expect(attention.map((item) => item.kind)).toEqual(['overdue_chore'])
  })

  it('keeps a submitted chore in approvals instead of the daily program', () => {
    const pending: ChoreCompletion = {
      id: 'completion-1',
      chore_id: 'chore-1',
      completed_by: 'member-1',
      completed_at: '2026-07-13T09:00:00Z',
      status: 'pending_approval',
      approved_by: null,
      approved_at: null,
      occurrence_due_date: TODAY,
      chore_title: 'Chore',
      reward_amount: 10,
    }

    expect(
      buildTodayEntries({
        chores: [makeChore({ due_date: TODAY })],
        activities: [],
        medicalRecords: [],
        mealPlanEntries: [],
        latestCompletionFor: () => pending,
        today: TODAY,
      })
    ).toEqual([])
  })

  it('uses a one-off assignee override in the daily program', () => {
    const entries = buildTodayEntries({
      chores: [makeChore({ id: 'chore-1', assigned_to: 'child-a', due_date: TODAY })],
      activities: [], medicalRecords: [], mealPlanEntries: [], latestCompletionFor: noCompletion, today: TODAY,
      occurrenceOverrides: [{
        id: 'override-1', family_id: 'family-1', series_type: 'task', series_id: 'chore-1',
        occurrence_date: TODAY, companion_member_id: null, assignee_member_id: 'child-b',
        cancelled: false, updated_at: '2026-07-12T10:00:00Z',
      }],
    })

    expect(entries[0]).toMatchObject({ childOrPatientId: 'child-b', responsibleMemberId: 'child-b', assignmentOverridden: true })
  })
})

describe('buildTodayAttentionItems', () => {
  it('contains only overdue or actionable records and open votes still needing a response', () => {
    const alreadyVotedRound: MealVoteRound = {
      id: 'round-voted',
      family_id: 'family-1',
      title: 'Already voted',
      description: null,
      status: 'open',
      deadline_at: null,
      created_by: 'user-1',
      created_at: '2026-07-01T10:00:00Z',
      closed_at: null,
      candidates: [makeMealVoteCandidate({ votes: [makeMealVote({ member_id: 'member-1' })] })],
    }
    const needsVoteRound: MealVoteRound = {
      ...alreadyVotedRound,
      id: 'round-open',
      title: 'Choose dinner',
      candidates: [makeMealVoteCandidate({ votes: [] })],
    }

    const items = buildTodayAttentionItems({
      chores: [
        makeChore({ id: 'overdue', due_date: '2026-07-12' }),
        makeChore({ id: 'today', due_date: TODAY }),
      ],
      activities: [
        makeActivity({ id: 'payment-overdue', next_payment_due_date: '2026-07-12' }),
        makeActivity({ id: 'payment-today', next_payment_due_date: TODAY }),
      ],
      medicalRecords: [
        makeMedicalRecord({ id: 'medical-overdue', record_date: '2026-07-12' }),
        makeMedicalRecord({ id: 'medical-today', record_date: TODAY }),
        makeMedicalRecord({ id: 'medical-cancelled', record_date: '2026-07-12', status: 'cancelled' }),
      ],
      voteRounds: [alreadyVotedRound, needsVoteRound],
      currentMemberId: 'member-1',
      latestCompletionFor: noCompletion,
      today: TODAY,
    })

    expect(items.map((item) => item.kind)).toEqual([
      'overdue_chore',
      'overdue_payment',
      'overdue_medical',
      'meal_vote',
    ])
  })

  it('uses the effective assignee for an overdue overridden chore', () => {
    const items = buildTodayAttentionItems({
      chores: [makeChore({ id: 'chore-1', assigned_to: 'child-a', due_date: '2026-07-12' })],
      activities: [], medicalRecords: [], voteRounds: [], currentMemberId: 'child-b', latestCompletionFor: noCompletion, today: TODAY,
      occurrenceOverrides: [{
        id: 'override-1', family_id: 'family-1', series_type: 'task', series_id: 'chore-1',
        occurrence_date: '2026-07-12', companion_member_id: null, assignee_member_id: 'child-b',
        cancelled: false, updated_at: '2026-07-12T10:00:00Z',
      }],
    })

    expect(items[0]).toMatchObject({ kind: 'overdue_chore', personId: 'child-b', responsibleMemberId: 'child-b' })
  })
})

describe('child Today visibility', () => {
  it('shows own tasks and household meals, but not sibling tasks or payments', () => {
    expect(isChildTodayEntryVisible(entry({ responsibleMemberId: 'child-a' }), 'child-a')).toBe(true)
    expect(isChildTodayEntryVisible(entry({ responsibleMemberId: 'child-b' }), 'child-a')).toBe(false)
    expect(isChildTodayEntryVisible(entry({ type: 'meal', sourceType: 'meal' }), 'child-a')).toBe(true)
    expect(isChildTodayEntryVisible(entry({ type: 'payment', sourceType: 'activity_payment', responsibleMemberId: 'child-a' }), 'child-a')).toBe(false)
  })

  it('keeps only own overdue chores and meal voting in attention', () => {
    const base = { id: 'attention', itemType: 'chore' as const, title: 'Task', responsibleMemberId: 'child-a', date: TODAY, route: '/chores' as const }
    expect(isChildTodayAttentionVisible({ ...base, kind: 'overdue_chore', personId: 'child-a' }, 'child-a')).toBe(true)
    expect(isChildTodayAttentionVisible({ ...base, kind: 'overdue_chore', personId: 'child-b' }, 'child-a')).toBe(false)
    expect(isChildTodayAttentionVisible({ ...base, kind: 'meal_vote', personId: 'child-a' }, 'child-a')).toBe(true)
    expect(isChildTodayAttentionVisible({ ...base, kind: 'overdue_payment', personId: 'child-a' }, 'child-a')).toBe(false)
  })
})
