import { supabase } from '../supabaseClient'
import { connectionStateFromSubscribeStatus } from '../realtime/connectionState'
import { openRealtimeLifecycle } from '../realtime/realtimeRegistry'

export type CalendarRealtimeStop = () => Promise<void>
export type CalendarRealtimeSubscription = (familyId: string, onRemoteChange: () => void) => Promise<CalendarRealtimeStop>

const channelTeardowns = new Map<string, Promise<void>>()

export const subscribeToCalendarRealtime: CalendarRealtimeSubscription = async (familyId, onRemoteChange) => {
  const topic = `family:${familyId}:calendar-offline`
  await channelTeardowns.get(topic)
  let channel = supabase.channel(topic)
  const familyTables = [
    'chores', 'activities', 'medical_records', 'meal_plan_entries', 'allowance_plans',
    'occurrence_overrides', 'series_assignment_history', 'activity_participant_history', 'members',
  ]
  for (const table of familyTables) {
    channel = channel.on('postgres_changes', {
      event: '*', schema: 'public', table, filter: `family_id=eq.${familyId}`,
    }, onRemoteChange)
  }
  // These join tables do not have family_id. RLS still limits delivery to
  // rows visible through their parent record.
  for (const table of ['chore_completions', 'activity_participants']) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, onRemoteChange)
  }
  const lifecycle = openRealtimeLifecycle({
    channelName: topic,
    owner: 'CalendarRepository',
    openReason: 'repository-start',
    tables: [...familyTables, 'chore_completions', 'activity_participants'],
  })
  try {
    channel.subscribe((status) => lifecycle.status(connectionStateFromSubscribeStatus(status)))
  } catch (error) {
    lifecycle.close('subscribe-failed')
    throw error
  }

  let stopped = false
  return async () => {
    if (stopped) return
    stopped = true
    const teardown = Promise.resolve(supabase.removeChannel(channel)).then(() => undefined, () => undefined)
    channelTeardowns.set(topic, teardown)
    try { await teardown }
    finally {
      lifecycle.close('repository-stop')
      if (channelTeardowns.get(topic) === teardown) channelTeardowns.delete(topic)
    }
  }
}
