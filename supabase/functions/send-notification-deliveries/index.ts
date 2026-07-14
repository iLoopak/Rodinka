import { createClient } from 'npm:@supabase/supabase-js@2.110.2'
import { buildPushPayload } from 'npm:@block65/webcrypto-web-push@1.0.2'
import { deferPastQuietHours, isWithinQuietHoursAt } from '../../../src/notifications/reminderDelivery.ts'
import { DEFAULT_CATEGORY_PREFERENCES, type NotificationPreferences, type ReminderCategory } from '../../../src/notifications/reminders.ts'

interface SenderRequest { mode?: 'scheduled' | 'test' | 'diagnostic'; familyId?: string; batchSize?: number }
interface Delivery {
  id: string; user_id: string; family_id: string; target_member_id: string; reminder_id: string | null
  delivery_type: 'immediate' | 'daily_digest' | 'weekly_digest'; title: string; body: string | null
  deep_link: string | null; importance: 'quiet' | 'normal' | 'important'; attempt_count: number
  expires_at: string; metadata: Record<string, unknown>
}
interface Subscription { id: string; endpoint: string; p256dh: string; auth: string }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-notification-sender-secret',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } })
}

function secureEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

function validateVapid(publicKey: string, privateKey: string, subject: string) {
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(publicKey) || !/^[A-Za-z0-9_-]{40,60}$/.test(privateKey)) throw new Error('invalid_vapid_key_format')
  if (!(/^mailto:[^\s@]+@[^\s@]+$/.test(subject) || /^https:\/\/[^\s/]+/.test(subject))) throw new Error('invalid_vapid_subject')
}

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest).slice(0, 6)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function preferenceFromRow(row: Record<string, unknown>, delivery: Delivery): NotificationPreferences {
  return {
    memberId: delivery.target_member_id, familyId: delivery.family_id,
    inAppEnabled: Boolean(row.in_app_enabled), pushEnabled: Boolean(row.push_enabled),
    dailyDigestEnabled: Boolean(row.daily_digest_enabled), weeklyDigestEnabled: Boolean(row.weekly_digest_enabled),
    quietPushEnabled: Boolean(row.quiet_push_enabled), quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: String(row.quiet_hours_start ?? '21:00').slice(0, 5), quietHoursEnd: String(row.quiet_hours_end ?? '07:00').slice(0, 5),
    timezone: String(row.timezone ?? 'UTC'), timezoneMode: row.timezone_mode === 'explicit' ? 'explicit' : 'auto',
    locale: row.locale === 'en' ? 'en' : 'cs',
    categories: { ...DEFAULT_CATEGORY_PREFERENCES, ...((row.category_preferences as Partial<Record<ReminderCategory, boolean>> | null) ?? {}) },
  }
}

function categoryForSource(source: string): ReminderCategory {
  if (source === 'chore') return 'chores'
  if (source === 'activity' || source === 'activity-payment') return 'activities'
  if (source === 'medical-appointment' || source === 'vaccination') return 'medical'
  if (source === 'voting') return 'voting'
  if (source === 'meal-plan') return 'meals'
  if (source === 'allowance') return 'allowance'
  if (source === 'document') return 'documents'
  return 'shopping'
}

function retryAt(attempt: number) {
  const delays = [60, 300, 900, 3600, 14400]
  return new Date(Date.now() + delays[Math.min(Math.max(attempt - 1, 0), delays.length - 1)] * 1000).toISOString()
}

function errorResult(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error && typeof error.status === 'number' ? error.status : null
  if (status === 404 || status === 410) return { status, code: 'subscription_gone', dead: true, retryable: false }
  if (status === 401 || status === 403) return { status, code: 'vapid_rejected', dead: false, retryable: false }
  if (status === 429) return { status, code: 'push_rate_limited', dead: false, retryable: true }
  if (status && status >= 500) return { status, code: 'push_service_unavailable', dead: false, retryable: true }
  if (status && status >= 400) return { status, code: 'invalid_push_request', dead: false, retryable: false }
  return { status, code: 'push_network_error', dead: false, retryable: true }
}

function safePayload(delivery: Delivery, reminder: Record<string, unknown> | null, locale: 'cs' | 'en') {
  let title = delivery.title.slice(0, 120)
  let body = (delivery.body || (locale === 'en' ? 'You have a new reminder.' : 'Máte novou připomínku.')).slice(0, 400)
  const source = String(reminder?.source ?? '')
  if (source === 'medical-appointment' || source === 'vaccination') {
    title = locale === 'en' ? 'Health reminder' : 'Zdravotní připomínka'
    body = locale === 'en' ? 'You have an important health appointment coming up.' : 'Čeká vás důležitý zdravotní termín.'
  } else if (source === 'document') {
    title = locale === 'en' ? 'Document reminder' : 'Připomínka dokumentu'
    body = locale === 'en' ? 'It is time to check an important family document.' : 'Je čas zkontrolovat důležitý rodinný dokument.'
  }
  const tagKind = delivery.delivery_type === 'daily_digest' ? 'daily-digest' : delivery.delivery_type === 'weekly_digest' ? 'weekly-digest' : 'reminder'
  return JSON.stringify({
    version: 1, deliveryId: delivery.id, title, body,
    deepLink: typeof delivery.deep_link === 'string' && delivery.deep_link.startsWith('/') && !delivery.deep_link.startsWith('//') ? delivery.deep_link : '/reminders',
    tag: `rodinka-${tagKind}:${delivery.id}`, importance: delivery.importance,
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' })
  const startedAt = Date.now()
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const senderSecret = Deno.env.get('NOTIFICATION_SENDER_SECRET') ?? ''
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? ''
  if (!supabaseUrl || !serviceRoleKey) return json(500, { ok: false, error: 'supabase_not_configured' })

  let input: SenderRequest
  try { input = await request.json() } catch { return json(400, { ok: false, error: 'invalid_json' }) }
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let onlyDeliveryId: string | null = null

  if (input.mode === 'test') {
    const authorization = request.headers.get('authorization') ?? ''
    if (!authorization.startsWith('Bearer ') || !input.familyId) return json(401, { ok: false, error: 'authentication_required' })
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userError } = await userClient.auth.getUser(authorization.slice(7))
    if (userError || !userData.user) return json(401, { ok: false, error: 'invalid_session' })
    const { data, error } = await userClient.rpc('queue_test_notification', { p_family_id: input.familyId })
    if (error) return json(400, { ok: false, error: error.message.includes('wait') ? 'test_rate_limited' : 'test_not_available' })
    onlyDeliveryId = data as string
  } else {
    const supplied = request.headers.get('x-notification-sender-secret') ?? ''
    if (!senderSecret || !secureEqual(supplied, senderSecret)) return json(401, { ok: false, error: 'unauthorized' })
  }

  if (input.mode === 'diagnostic') return json(200, {
    ok: true, vapidConfigured: Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject),
    vapidPublicKeyFingerprint: vapidPublicKey ? await fingerprint(vapidPublicKey) : null,
  })
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return json(503, { ok: false, error: 'vapid_not_configured', vapidConfigured: false })

  try { validateVapid(vapidPublicKey, vapidPrivateKey, vapidSubject) }
  catch { return json(503, { ok: false, error: 'invalid_vapid_configuration', vapidPublicKeyFingerprint: await fingerprint(vapidPublicKey) }) }

  const token = crypto.randomUUID()
  const batchSize = onlyDeliveryId ? 1 : Math.min(Math.max(Number(input.batchSize) || 50, 1), 100)
  const { data: claimed, error: claimError } = await service.rpc('claim_notification_deliveries', {
    p_batch_size: batchSize, p_processing_token: token, p_only_id: onlyDeliveryId,
  })
  if (claimError) return json(500, { ok: false, error: 'claim_failed' })
  const diagnostics = { claimed: 0, delivered: 0, deferred: 0, cancelled: 0, failed: 0, attempts: 0, successes: 0, deadSubscriptions: 0, transientFailures: 0 }

  for (const delivery of (claimed ?? []) as Delivery[]) {
    diagnostics.claimed += 1
    const [{ data: preferenceRow }, { data: reminder }, { data: subscriptions }] = await Promise.all([
      service.from('notification_preferences').select('*').eq('member_id', delivery.target_member_id).maybeSingle(),
      delivery.reminder_id ? service.from('reminders').select('source,resolved_at,dismissed_at,expires_at').eq('id', delivery.reminder_id).maybeSingle() : Promise.resolve({ data: null }),
      service.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('target_member_id', delivery.target_member_id).is('disabled_at', null).is('revoked_at', null),
    ])
    const finish = (status: string, code: string | null = null, next: string | null = null) => service.rpc('finish_notification_delivery', {
      p_delivery_id: delivery.id, p_processing_token: token, p_status: status, p_error_code: code, p_next_attempt_at: next,
    })
    if (!preferenceRow || !preferenceRow.push_enabled) { await finish('cancelled', 'push_disabled'); diagnostics.cancelled += 1; continue }
    const preferences = preferenceFromRow(preferenceRow, delivery)
    if (delivery.delivery_type === 'daily_digest' && !preferences.dailyDigestEnabled) { await finish('cancelled', 'daily_digest_disabled'); diagnostics.cancelled += 1; continue }
    if (delivery.delivery_type === 'weekly_digest' && !preferences.weeklyDigestEnabled) { await finish('cancelled', 'weekly_digest_disabled'); diagnostics.cancelled += 1; continue }
    if (reminder && (reminder.resolved_at || reminder.dismissed_at || (reminder.expires_at && Date.parse(String(reminder.expires_at)) <= Date.now()))) { await finish('cancelled', 'reminder_no_longer_relevant'); diagnostics.cancelled += 1; continue }
    if (reminder && !preferences.categories[categoryForSource(String(reminder.source))]) { await finish('cancelled', 'category_disabled'); diagnostics.cancelled += 1; continue }
    if (delivery.importance !== 'important' && isWithinQuietHoursAt(new Date(), preferences)) {
      await finish('pending', 'quiet_hours', deferPastQuietHours(new Date(), preferences).toISOString()); diagnostics.deferred += 1; continue
    }
    if (!subscriptions?.length) { await finish('cancelled', 'no_active_subscription'); diagnostics.cancelled += 1; continue }

    const payload = safePayload(delivery, reminder as Record<string, unknown> | null, preferences.locale)
    let succeeded = 0; let retryable = 0; let permanent = 0
    for (const subscription of subscriptions as Subscription[]) {
      diagnostics.attempts += 1
      const { data: attempt } = await service.from('notification_delivery_attempts').insert({
        delivery_id: delivery.id, push_subscription_id: subscription.id, attempt_number: delivery.attempt_count,
      }).select('id').single()
      try {
        const requestInit = await buildPushPayload({
          data: payload,
          options: {
            ttl: Math.max(60, Math.min(86400, Math.floor((Date.parse(delivery.expires_at) - Date.now()) / 1000))),
            urgency: delivery.importance === 'important' ? 'high' : 'normal',
            topic: delivery.id.replace(/-/g, '').slice(0, 32),
          },
        }, {
          endpoint: subscription.endpoint, expirationTime: null,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, {
          subject: vapidSubject, publicKey: vapidPublicKey, privateKey: vapidPrivateKey,
        })
        const response = await fetch(subscription.endpoint, { ...requestInit, signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw { status: response.status }
        succeeded += 1; diagnostics.successes += 1
        if (attempt) await service.from('notification_delivery_attempts').update({ status: 'succeeded', finished_at: new Date().toISOString() }).eq('id', attempt.id)
        await service.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), failure_count: 0, updated_at: new Date().toISOString() }).eq('id', subscription.id)
      } catch (caught) {
        const result = errorResult(caught)
        if (result.retryable) { retryable += 1; diagnostics.transientFailures += 1 } else permanent += 1
        if (result.dead) diagnostics.deadSubscriptions += 1
        if (attempt) await service.from('notification_delivery_attempts').update({ status: result.dead ? 'dead' : 'failed', finished_at: new Date().toISOString(), response_status: result.status, error_code: result.code, retryable: result.retryable }).eq('id', attempt.id)
        await service.from('push_subscriptions').update({
          last_failure_at: new Date().toISOString(), failure_count: 1,
          ...(result.dead ? { disabled_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString(),
        }).eq('id', subscription.id)
      }
    }
    if (succeeded > 0) { await finish('delivered'); diagnostics.delivered += 1 }
    else if (retryable > 0 && delivery.attempt_count < 5 && Date.parse(delivery.expires_at) > Date.now()) { await finish('pending', 'transient_push_failure', retryAt(delivery.attempt_count)); diagnostics.failed += 1 }
    else { await finish(permanent > 0 ? 'failed' : 'cancelled', permanent > 0 ? 'permanent_push_failure' : 'all_subscriptions_dead', delivery.attempt_count < 5 && permanent > 0 ? retryAt(delivery.attempt_count) : null); diagnostics.failed += 1 }
  }

  return json(200, {
    ok: true, mode: input.mode ?? 'scheduled', deliveryId: onlyDeliveryId,
    vapidConfigured: true, vapidPublicKeyFingerprint: await fingerprint(vapidPublicKey),
    durationMs: Date.now() - startedAt, ...diagnostics,
  })
})
