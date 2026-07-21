import { createClient } from 'npm:@supabase/supabase-js@2.110.2'
import { reminderCopyFor } from '../../../src/notifications/reminderCopy.ts'
import {
  DEFAULT_CATEGORY_PREFERENCES,
  defaultNotificationPreferences,
  generateReminderDrafts,
  isValidTimeZone,
  type NotificationPreferences,
  type ReminderCategory,
} from '../../../src/notifications/reminders.ts'
import { createDeliveryDrafts, deliveryOccurrenceIdentity, type ReminderDeliveryState } from '../../../src/notifications/reminderDelivery.ts'

interface ProcessRemindersRequest {
  householdId?: string
  userId?: string
  cursor?: string
  batchSize?: number
  dryRun?: boolean
  fairQueue?: boolean
}

interface ProcessingTarget {
  member_id: string
  family_id: string
  user_id: string
  display_name: string
  role: 'admin' | 'parent' | 'child'
}

interface SourceSnapshot {
  members: Array<{ id: string; family_id: string; display_name: string; role: 'admin' | 'parent' | 'child'; user_id: string | null }>
  chores: Array<Record<string, unknown>>
  completions: Array<Record<string, unknown>>
  activities: Array<Record<string, unknown>>
  medicalRecords: Array<Record<string, unknown>>
  voteRounds: Array<Record<string, unknown>>
  planEntries: Array<Record<string, unknown>>
  pendingCompletions: Array<Record<string, unknown>>
  shoppingItems: Array<Record<string, unknown>>
  documents: Array<Record<string, unknown>>
  occurrenceOverrides: Array<Record<string, unknown>>
  assignmentHistory: Array<Record<string, unknown>>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('source limit')) return 'source_limit_exceeded'
  if (message.includes('timezone')) return 'invalid_timezone'
  if (message.includes('not found')) return 'not_found'
  return 'processing_failed'
}

function preferencesFromRow(row: Record<string, unknown> | null, target: ProcessingTarget): { preferences: NotificationPreferences; invalidTimezone: boolean } {
  const defaults = defaultNotificationPreferences(target.member_id, target.family_id, 'UTC')
  if (!row) return { preferences: defaults, invalidTimezone: false }
  const timezone = String(row.timezone ?? 'UTC')
  const dailyDigestEnabled = Boolean(row.daily_digest_enabled)
  const invalidTimezone = !isValidTimeZone(timezone)
  return { preferences: {
    ...defaults,
    inAppEnabled: Boolean(row.in_app_enabled),
    pushEnabled: Boolean(row.push_enabled),
    dailyDigestEnabled,
    weeklyDigestEnabled: !dailyDigestEnabled && Boolean(row.weekly_digest_enabled),
    quietPushEnabled: Boolean(row.quiet_push_enabled),
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: String(row.quiet_hours_start ?? defaults.quietHoursStart).slice(0, 5),
    quietHoursEnd: String(row.quiet_hours_end ?? defaults.quietHoursEnd).slice(0, 5),
    timezone: invalidTimezone ? 'UTC' : timezone,
    timezoneMode: row.timezone_mode === 'explicit' ? 'explicit' : 'auto',
    locale: row.locale === 'en' ? 'en' : 'cs',
    categories: { ...DEFAULT_CATEGORY_PREFERENCES, ...((row.category_preferences as Partial<Record<ReminderCategory, boolean>> | null) ?? {}) },
  }, invalidTimezone }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const configuredSecret = Deno.env.get('REMINDER_PROCESSOR_SECRET') ?? ''
  const suppliedSecret = request.headers.get('x-rodinka-cron-secret') ?? ''
  if (!configuredSecret || !suppliedSecret || !secureEqual(configuredSecret, suppliedSecret)) return json(401, { error: 'unauthorized' })

  let body: ProcessRemindersRequest
  try { body = await request.json() as ProcessRemindersRequest }
  catch { return json(400, { error: 'invalid_json' }) }

  const requestedBatchSize = Number(body.batchSize ?? 50)
  const batchSize = Number.isFinite(requestedBatchSize) ? Math.min(100, Math.max(1, Math.trunc(requestedBatchSize))) : 50
  if (body.householdId && !UUID.test(body.householdId)) return json(400, { error: 'invalid_household_id' })
  if (body.userId && !UUID.test(body.userId)) return json(400, { error: 'invalid_user_id' })
  if (body.cursor && !UUID.test(body.cursor)) return json(400, { error: 'invalid_cursor' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: 'server_not_configured' })
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const startedAt = new Date()
  const diagnostics = {
    usersProcessed: 0, householdsProcessed: 0, remindersCreated: 0, remindersUpdated: 0,
    remindersResolved: 0, deliveriesCreated: 0, deliveriesCancelled: 0, skippedUsers: 0, warnings: 0, errors: 0,
  }
  let runId: string | null = null

  if (!body.dryRun) {
    await supabase.from('notification_processing_runs').update({
      status: 'failed', finished_at: startedAt.toISOString(), error_summary: 'run_timeout', errors_count: 1,
    }).eq('status', 'running').lt('started_at', new Date(startedAt.getTime() - 15 * 60 * 1000).toISOString())
    const { data: run, error } = await supabase.from('notification_processing_runs').insert({ status: 'running' }).select('id').single()
    if (error) return json(500, { error: 'diagnostics_unavailable' })
    runId = run.id
  }

  const { data: targets, error: targetError } = await supabase.rpc('get_reminder_processing_targets', {
    p_cursor: body.cursor ?? null,
    p_batch_size: batchSize,
    p_family_id: body.householdId ?? null,
    p_user_id: body.userId ?? null,
    p_fair_queue: Boolean(body.fairQueue),
  })
  if (targetError) {
    if (runId) await supabase.from('notification_processing_runs').update({ status: 'failed', finished_at: new Date().toISOString(), errors_count: 1, error_summary: 'target_loading_failed' }).eq('id', runId)
    return json(500, { error: 'target_loading_failed' })
  }

  const typedTargets = (targets ?? []) as ProcessingTarget[]
  const snapshotCache = new Map<string, Promise<SourceSnapshot>>()
  const processedFamilies = new Set<string>()
  const errorCodes: string[] = []
  const warningCodes: string[] = []

  const loadSnapshot = (familyId: string) => {
    const cached = snapshotCache.get(familyId)
    if (cached) return cached
    const operation = Promise.all([
      supabase.rpc('get_reminder_source_snapshot', { p_family_id: familyId }),
      supabase.from('occurrence_overrides').select('id,family_id,series_type,series_id,occurrence_date,companion_member_id,assignee_member_id,cancelled,updated_at').eq('family_id', familyId),
      supabase.from('series_assignment_history').select('id,family_id,series_type,series_id,effective_from,member_id').eq('family_id', familyId),
    ]).then(([snapshotResult, overrideResult, historyResult]) => {
      if (snapshotResult.error || overrideResult.error || historyResult.error) throw new Error(snapshotResult.error?.message ?? overrideResult.error?.message ?? historyResult.error?.message)
      return { ...(snapshotResult.data as SourceSnapshot), occurrenceOverrides: overrideResult.data ?? [], assignmentHistory: historyResult.data ?? [] }
    })
    snapshotCache.set(familyId, operation)
    return operation
  }

  for (const target of typedTargets) {
    try {
      const [snapshot, preferenceResult, reminderResult] = await Promise.all([
        loadSnapshot(target.family_id),
        supabase.from('notification_preferences').select('*').eq('member_id', target.member_id).maybeSingle(),
        supabase.from('reminders').select('dedupe_key,read_at,dismissed_at,resolved_at,generated_at,metadata').eq('family_id', target.family_id).eq('target_member_id', target.member_id).limit(300),
      ])
      if (preferenceResult.error) throw new Error(preferenceResult.error.message)
      if (reminderResult.error) throw new Error(reminderResult.error.message)
      const currentMember = snapshot.members.find((member) => member.id === target.member_id)
      if (!currentMember) throw new Error('member not found')
      const preferenceMapping = preferencesFromRow(preferenceResult.data as Record<string, unknown> | null, target)
      const preferences = preferenceMapping.preferences
      if (preferenceMapping.invalidTimezone) {
        diagnostics.warnings += 1
        warningCodes.push('invalid_timezone_defaulted_to_utc')
      }
      const completionByChore = new Map(snapshot.completions.map((completion) => [String(completion.chore_id), completion]))
      const now = new Date()
      const drafts = generateReminderDrafts({
        familyId: target.family_id,
        currentMember,
        isParentOrAdmin: currentMember.role === 'admin' || currentMember.role === 'parent',
        members: snapshot.members,
        chores: snapshot.chores as never,
        latestCompletionFor: (choreId) => (completionByChore.get(choreId) ?? null) as never,
        activities: snapshot.activities as never,
        occurrenceOverrides: snapshot.occurrenceOverrides as never,
        assignmentHistory: snapshot.assignmentHistory as never,
        medicalRecords: snapshot.medicalRecords as never,
        voteRounds: snapshot.voteRounds as never,
        pendingCompletions: snapshot.pendingCompletions as never,
        shoppingItems: snapshot.shoppingItems as never,
        documents: snapshot.documents as never,
        preferences,
        copy: reminderCopyFor(preferences.locale),
        now,
      })
      const existingState: Record<string, ReminderDeliveryState> = {}
      for (const row of (reminderResult.data ?? []) as Array<Record<string, unknown>>) existingState[String(row.dedupe_key)] = {
        readAt: row.read_at ? String(row.read_at) : null,
        dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
        resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
        generatedAt: row.generated_at ? String(row.generated_at) : null,
        occurrenceKey: deliveryOccurrenceIdentity(String(row.dedupe_key), row.metadata as never),
      }
      const deliveries = createDeliveryDrafts({
        familyId: target.family_id, memberId: target.member_id, now, preferences, reminders: drafts,
        existingState, locale: preferences.locale,
      })

      if (body.dryRun) {
        diagnostics.remindersCreated += drafts.length
        diagnostics.deliveriesCreated += deliveries.length
      } else {
        const { data: result, error } = await supabase.rpc('sync_server_member_reminders', {
          p_family_id: target.family_id, p_member_id: target.member_id, p_reminders: drafts, p_deliveries: deliveries,
          p_delivery_settings: {
            pushEnabled: preferences.pushEnabled,
            dailyDigestEnabled: preferences.dailyDigestEnabled,
            weeklyDigestEnabled: preferences.weeklyDigestEnabled,
          },
        })
        if (error) throw new Error(error.message)
        const counts = result as Record<string, number>
        diagnostics.remindersCreated += counts.remindersCreated ?? 0
        diagnostics.remindersUpdated += counts.remindersUpdated ?? 0
        diagnostics.remindersResolved += counts.remindersResolved ?? 0
        diagnostics.deliveriesCreated += counts.deliveriesCreated ?? 0
        diagnostics.deliveriesCancelled += counts.deliveriesCancelled ?? 0
        await supabase.from('notification_processing_state').upsert({
          member_id: target.member_id, family_id: target.family_id, last_processed_at: now.toISOString(),
          last_error_at: null, last_error_code: null, updated_at: now.toISOString(),
        })
      }
      diagnostics.usersProcessed += 1
      processedFamilies.add(target.family_id)
    } catch (error) {
      const code = safeError(error)
      diagnostics.errors += 1
      diagnostics.skippedUsers += 1
      errorCodes.push(code)
      if (!body.dryRun) await supabase.from('notification_processing_state').upsert({
        member_id: target.member_id, family_id: target.family_id, last_error_at: new Date().toISOString(),
        last_error_code: code, updated_at: new Date().toISOString(),
      })
    }
  }

  diagnostics.householdsProcessed = processedFamilies.size
  const continuationCursor = !body.fairQueue && typedTargets.length === batchSize ? typedTargets.at(-1)?.member_id ?? null : null
  const status = diagnostics.errors === 0 ? 'completed' : diagnostics.usersProcessed > 0 ? 'partial' : 'failed'
  if (runId) await supabase.from('notification_processing_runs').update({
    status, finished_at: new Date().toISOString(), users_processed: diagnostics.usersProcessed,
    households_processed: diagnostics.householdsProcessed, reminders_created: diagnostics.remindersCreated,
    reminders_updated: diagnostics.remindersUpdated, reminders_resolved: diagnostics.remindersResolved,
    deliveries_created: diagnostics.deliveriesCreated, deliveries_cancelled: diagnostics.deliveriesCancelled,
    skipped_users: diagnostics.skippedUsers, warnings_count: diagnostics.warnings,
    errors_count: diagnostics.errors, continuation_cursor: continuationCursor,
    error_summary: [...new Set([...errorCodes, ...warningCodes])].slice(0, 10).join(',') || null,
  }).eq('id', runId)

  return json(status === 'failed' && typedTargets.length > 0 ? 500 : 200, {
    status, dryRun: Boolean(body.dryRun), batchSize, targets: typedTargets.length,
    ...diagnostics, continuationCursor, durationMs: Date.now() - startedAt.getTime(),
  })
})
