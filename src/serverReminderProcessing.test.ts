/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20260714130000_server_reminder_processing.sql'), 'utf8').toLowerCase()
const edgeFunction = readFileSync(join(process.cwd(), 'supabase', 'functions', 'process-reminders', 'index.ts'), 'utf8')

describe('server reminder processing contract', () => {
  it('uses the same reminder domain as the client', () => {
    expect(edgeFunction).toContain("from '../../../src/notifications/reminders.ts'")
    expect(edgeFunction).toContain('generateReminderDrafts({')
    expect(edgeFunction).toContain("from '../../../src/notifications/reminderDelivery.ts'")
  })

  it('rejects unauthorized requests before creating a service client', () => {
    expect(edgeFunction.indexOf("return json(401, { error: 'unauthorized' })")).toBeLessThan(edgeFunction.indexOf('createClient(supabaseUrl'))
    expect(edgeFunction).toContain('secureEqual(configuredSecret, suppliedSecret)')
  })

  it('bounds batches, supports dry runs and isolates target failures', () => {
    expect(edgeFunction).toContain('Math.min(100, Math.max(1')
    expect(edgeFunction).toContain('if (body.dryRun)')
    expect(edgeFunction).toContain('for (const target of typedTargets)')
    expect(edgeFunction).toContain('catch (error)')
  })

  it('prevents duplicate reminders and deliveries at the database boundary', () => {
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('on conflict (target_member_id, dedupe_key) do update')
    expect(migration).toContain('idempotency_key text not null unique')
    expect(migration).toContain('on conflict (idempotency_key) do nothing')
  })

  it('cancels obsolete deliveries and recovers expired processing leases', () => {
    expect(migration).toContain("set status = 'cancelled'")
    expect(migration).toContain("processing_started_at < now() - interval '15 minutes'")
    expect(migration).toContain("error_code = 'lease_expired'")
    expect(edgeFunction).toContain("error_summary: 'run_timeout'")
  })

  it('keeps outbox and diagnostics server-only', () => {
    expect(migration).toContain('alter table notification_deliveries enable row level security')
    expect(migration).toContain('revoke all on table notification_deliveries from anon, authenticated')
    expect(migration).toContain('grant all on table notification_deliveries to service_role')
    expect(migration).toContain("auth.role() is distinct from 'service_role'")
  })

  it('defines a repeatable ten-minute cron using Vault secrets', () => {
    expect(migration).toContain("'*/10 * * * *'")
    expect(migration).toContain("name = 'rodinka_project_url'")
    expect(migration).toContain("name = 'rodinka_reminder_cron_secret'")
    expect(migration).not.toMatch(/service_role_key\s*[:=]\s*['"][a-z0-9]/)
  })
})
