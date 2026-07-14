import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = readFileSync(join(root, 'supabase/migrations/20260714140000_web_push_delivery.sql'), 'utf8')
const worker = readFileSync(join(root, 'public/sw.js'), 'utf8')
const sender = readFileSync(join(root, 'supabase/functions/send-notification-deliveries/index.ts'), 'utf8')
const client = readFileSync(join(root, 'src/push/pushClient.ts'), 'utf8')

describe('web push security and delivery contracts', () => {
  it('stores subscriptions behind own-device RLS and identity-derived RPCs', () => {
    expect(migration).toContain('endpoint text not null unique')
    expect(migration).toContain('users read own push devices')
    expect(migration).toContain('user_id = auth.uid()')
    expect(migration).toContain('actor uuid := auth.uid()')
    expect(migration).toContain('revoke all on table push_subscriptions from anon, authenticated')
  })

  it('claims bounded deliveries with a lease and concurrent-row protection', () => {
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain("lease_expires_at = now() + interval '3 minutes'")
    expect(migration).toContain('least(greatest(p_batch_size, 1), 100)')
    expect(migration).toContain('processing_token = p_processing_token')
  })

  it('keeps sending and attempts server-only', () => {
    expect(migration).toContain('notification_delivery_attempts')
    expect(migration).toContain('revoke all on table notification_delivery_attempts from public, anon, authenticated')
    expect(sender).toContain("npm:@block65/webcrypto-web-push@1.0.2")
    expect(sender).toContain("request.headers.get('x-notification-sender-secret')")
    expect(sender).toContain("status === 404 || status === 410")
    expect(sender).toContain("disabled_at: new Date().toISOString()")
  })

  it('uses an explicit browser action and reuses an existing subscription', () => {
    expect(client).toContain('await Notification.requestPermission()')
    expect(client).toContain('existing ?? await registration.pushManager.subscribe')
    expect(client).toContain("supabase.rpc('register_push_subscription'")
    expect(client).not.toMatch(/requestPermission\(\).*reconcileCurrentSubscription/s)
  })

  it('shows safe fallback pushes and rejects external click destinations', () => {
    expect(worker).toContain("self.addEventListener('push'")
    expect(worker).toContain("self.addEventListener('notificationclick'")
    expect(worker).toContain("value.startsWith('//')")
    expect(worker).toContain("target.origin === scope.origin")
    expect(worker).toContain("tag: payload.tag")
    expect(worker).toContain("clients.openWindow(targetUrl)")
  })

  it('routes test notifications through an authenticated outbox delivery', () => {
    expect(migration).toContain('create or replace function queue_test_notification')
    expect(migration).toContain("interval '2 minutes'")
    expect(sender).toContain("input.mode === 'test'")
    expect(sender).toContain("userClient.rpc('queue_test_notification'")
    expect(sender).toContain('p_only_id: onlyDeliveryId')
  })
})

