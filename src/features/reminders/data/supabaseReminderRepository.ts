import { supabase } from '../../../supabaseClient'
import type { NotificationPreferences } from '../../../notifications/reminders'
import { toRemindersError, type RemindersOperation } from '../domain/reminderErrors'
import {
  NOTIFICATION_PREFERENCE_COLUMNS,
  REMINDER_COLUMNS,
  REMINDER_SUMMARY_COLUMNS,
  mapPreferences,
  mapReminder,
  mapReminderSummaryRow,
  preferencesToRow,
} from '../domain/reminderMappers'
import {
  summaryFromRows,
  type ReminderPage,
  type ReminderPageQuery,
  type ReminderProcessingService,
  type ReminderRepository,
  type ReminderScope,
  type ReminderStateAction,
  type ReminderSyncInput,
} from './reminderRepository'

type Row = Record<string, unknown>

async function run<T>(operation: RemindersOperation, work: () => PromiseLike<{ data: unknown; error: unknown }>, map: (data: unknown) => T): Promise<T> {
  let result: { data: unknown; error: unknown }
  try {
    result = await work()
  } catch (error) {
    throw toRemindersError(operation, error)
  }
  if (result.error) throw toRemindersError(operation, result.error)
  return map(result.data)
}

const rows = (data: unknown): Row[] => Array.isArray(data) ? (data as Row[]) : []

export class SupabaseReminderRepository implements ReminderRepository {
  async getSummary(scope: ReminderScope) {
    return run('reminders.summary',
      () => supabase.from('reminders').select(REMINDER_SUMMARY_COLUMNS)
        .eq('family_id', scope.familyId).eq('target_member_id', scope.memberId)
        // Only rows that can possibly be unread; resolved and dismissed ones
        // can never contribute to the badge.
        .is('read_at', null).is('dismissed_at', null).is('resolved_at', null)
        .limit(1000),
      (data) => summaryFromRows(rows(data).map(mapReminderSummaryRow)))
  }

  async listPage(query: ReminderPageQuery): Promise<ReminderPage> {
    // Keyset pagination on generated_at, which is the same column the list is
    // ordered by. Offset paging would shift rows under the reader whenever the
    // sync RPC inserts something.
    let request = supabase.from('reminders').select(REMINDER_COLUMNS)
      .eq('family_id', query.scope.familyId)
      .eq('target_member_id', query.scope.memberId)
      .order('generated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(query.limit + 1)
    if (query.before) request = request.lt('generated_at', query.before)

    return run('reminders.list', () => request, (data) => {
      const mapped = rows(data).map(mapReminder)
      // One extra row was requested purely to learn whether more exist.
      const hasMore = mapped.length > query.limit
      const items = hasMore ? mapped.slice(0, query.limit) : mapped
      return { items, nextCursor: hasMore ? items.at(-1)?.generatedAt ?? null : null }
    })
  }

  async setState(scope: ReminderScope, ids: string[], action: ReminderStateAction) {
    if (ids.length === 0) return
    await run('reminders.setState',
      () => supabase.rpc('set_member_reminder_state', {
        p_family_id: scope.familyId, p_reminder_ids: ids, p_action: action,
      }),
      () => undefined)
  }

  async loadPreferences(scope: ReminderScope) {
    return run('reminders.loadPreferences',
      () => supabase.from('notification_preferences').select(NOTIFICATION_PREFERENCE_COLUMNS)
        .eq('member_id', scope.memberId).eq('family_id', scope.familyId).maybeSingle(),
      (data) => mapPreferences(data as Row | null, scope.memberId, scope.familyId))
  }

  async ensurePreferences(preferences: NotificationPreferences, existing: NotificationPreferences | null) {
    if (!existing) {
      await run('reminders.savePreferences',
        () => supabase.from('notification_preferences').upsert({
          member_id: preferences.memberId, family_id: preferences.familyId,
          timezone: preferences.timezone, timezone_mode: preferences.timezoneMode, locale: preferences.locale,
        }, { onConflict: 'member_id', ignoreDuplicates: true }),
        () => undefined)
      return
    }
    if (existing.timezone === preferences.timezone && existing.timezoneMode === preferences.timezoneMode) return
    await run('reminders.savePreferences',
      () => supabase.from('notification_preferences').update({
        timezone: preferences.timezone, timezone_mode: preferences.timezoneMode, updated_at: new Date().toISOString(),
      }).eq('member_id', preferences.memberId).eq('family_id', preferences.familyId),
      () => undefined)
  }

  async savePreferences(preferences: NotificationPreferences) {
    await run('reminders.savePreferences',
      () => supabase.from('notification_preferences').upsert({
        ...preferencesToRow(preferences), updated_at: new Date().toISOString(),
      }),
      () => undefined)
  }

  async updateLocale(scope: ReminderScope, locale: NotificationPreferences['locale']) {
    await run('reminders.savePreferences',
      () => supabase.from('notification_preferences')
        .update({ locale, updated_at: new Date().toISOString() })
        .eq('member_id', scope.memberId).eq('family_id', scope.familyId),
      () => undefined)
  }
}

export class SupabaseReminderProcessingService implements ReminderProcessingService {
  async synchronizeSources(input: ReminderSyncInput) {
    await run('reminders.sync',
      () => supabase.rpc('sync_member_reminders', { p_family_id: input.familyId, p_reminders: input.drafts }),
      () => undefined)
  }
}
