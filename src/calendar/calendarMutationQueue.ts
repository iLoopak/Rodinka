import { activityInputToRow } from '../domain/activities/types'
import type { Activity } from '../features/activities/domain/activityTypes'
import { choreInputToRow, type Chore } from '../utils/choreModel'
import type { CalendarMutation, CalendarSnapshotData } from './calendarTypes'

export function pendingCalendarRecords(mutations: CalendarMutation[]) {
  return new Map(mutations.map((mutation) => [mutation.localId, mutation]))
}

export function applyPendingCalendarMutations(data: CalendarSnapshotData, mutations: CalendarMutation[]): CalendarSnapshotData {
  let chores = [...data.chores]
  let activities = [...data.activities]
  for (const mutation of [...mutations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (mutation.type === 'create_chore') {
      const local = localChore(mutation)
      chores = [...chores.filter((item) => item.id !== local.id), local]
    } else {
      const local = localActivity(mutation)
      activities = [...activities.filter((item) => item.id !== local.id), local]
    }
  }
  return { ...data, chores, activities }
}

export function localChore(mutation: Extract<CalendarMutation, { type: 'create_chore' }>): Chore {
  const row = choreInputToRow(mutation.payload)
  return {
    id: mutation.localId,
    family_id: mutation.familyId,
    ...row,
    reward_amount: Number(row.reward_amount),
    status: 'active',
    sort_order: 0,
    created_at: mutation.createdAt,
    updated_at: mutation.createdAt,
  }
}

export function localActivity(mutation: Extract<CalendarMutation, { type: 'create_activity' }>): Activity {
  const row = activityInputToRow(mutation.payload)
  return {
    id: mutation.localId,
    family_id: mutation.familyId,
    ...row,
    child_id: mutation.payload.participantIds[0] ?? null,
    participant_ids: [...mutation.payload.participantIds],
    payment_paid_at: null,
    payment_paid_for_date: null,
    created_at: mutation.createdAt,
    updated_at: mutation.createdAt,
  }
}
