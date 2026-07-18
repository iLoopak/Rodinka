import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/20260720100000_messaging_push_notifications.sql', import.meta.url),
  'utf8',
)
const sender = readFileSync(
  new URL('../supabase/functions/send-notification-deliveries/index.ts', import.meta.url),
  'utf8',
)
const worker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

describe('messaging push — reuses the existing engine', () => {
  it('enqueues into notification_deliveries rather than a parallel table', () => {
    expect(migration).toContain('insert into public.notification_deliveries')
    // No second outbox, no second sender, no second cron.
    expect(migration).not.toMatch(/create table.*message_notification_deliveries/i)
    expect(migration).not.toMatch(/cron\.schedule/)
  })

  it('extends the existing preference row instead of a separate table', () => {
    expect(migration).toContain('alter table public.notification_preferences')
    expect(migration).toContain('message_direct_enabled')
    expect(migration).toContain('message_group_enabled')
    expect(migration).toContain('message_reply_mention_enabled')
    expect(migration).toContain('message_task_enabled')
    expect(migration).toContain('message_entity_enabled')
    expect(migration).toContain('message_sound_enabled')
    expect(migration).toContain('message_preview_enabled')
  })
})

describe('messaging push — suppression rules', () => {
  it('never notifies the author of the message', () => {
    expect(migration).toContain('cm.member_id is distinct from new.sender_member_id')
  })

  it('skips a member who is actively reading the conversation', () => {
    expect(migration).toContain('not public.is_member_present_in_conversation(conv.id, recipient.member_id)')
    expect(migration).toContain("last_active_at > now() - public.conversation_presence_window()")
  })

  it('skips muted conversations, and treats a lapsed timed mute as unmuted', () => {
    expect(migration).toContain("not public.conversation_mute_active(conv.id, recipient.member_id, array['all', 'messages'])")
    expect(migration).toContain('cm.muted_until is null or cm.muted_until > now()')
  })

  it('gates each kind on its own preference switch', () => {
    expect(migration).toMatch(/when 'mention' then np\.message_reply_mention_enabled/)
    expect(migration).toMatch(/when 'direct'\s+then np\.message_direct_enabled/)
    expect(migration).toMatch(/else np\.message_group_enabled/)
  })

  it('does not push ordinary system messages', () => {
    expect(migration).toMatch(/if new\.content_type = 'system' then\s*\n\s*return null;/)
  })

  it('only notifies the member an entity change actually concerns', () => {
    expect(migration).toContain('p_target_member_id = p_actor_member_id')
    expect(migration).toContain('from public.message_entity_refs r')
  })
})

describe('messaging push — idempotence and retries', () => {
  it('derives a stable per-recipient key and collapses replays', () => {
    expect(migration).toContain("'msg:' || new.id::text || ':' || recipient.member_id::text")
    expect(migration).toContain('on conflict (idempotency_key) do nothing')
  })

  it('fans out at commit so mentions written after the message are visible', () => {
    expect(migration).toContain('create constraint trigger messages_enqueue_push')
    expect(migration).toContain('deferrable initially deferred')
  })

  it('re-checks relevance at send time, not only at enqueue time', () => {
    expect(sender).toContain("service.rpc('message_delivery_still_relevant'")
    expect(sender).toContain('message_no_longer_relevant')
  })

  it('requeues rather than dropping when the relevance check itself fails', () => {
    expect(sender).toContain("finish('pending', 'relevance_check_failed'")
  })
})

describe('messaging push — privacy', () => {
  it('does not copy message text into the outbox row', () => {
    // The delivery carries a message id; the sender reads the body at send
    // time so the preview preference is applied at delivery, not enqueue.
    expect(migration).toContain("'messageId', new.id::text")
    expect(migration).toMatch(/-- No message text here on purpose/)
  })

  it('sends a generic payload when preview is disabled', () => {
    expect(sender).toContain('previewEnabled')
    expect(sender).toContain("'Nová zpráva v Rodince'")
    expect(sender).toContain("preferenceRow.message_preview_enabled !== false")
  })

  it('honours the sound preference through the payload', () => {
    expect(sender).toContain('preferenceRow.message_sound_enabled !== false')
    expect(sender).toContain('silent: !soundEnabled')
    expect(worker).toContain('silent: payload.silent')
  })

  it('cancels rather than delivers a message that was deleted meanwhile', () => {
    expect(sender).toContain("finish('cancelled', 'message_deleted')")
  })

  it('keeps presence rows unreadable by clients', () => {
    expect(migration).toContain('revoke all on table public.conversation_presence from public, anon, authenticated')
  })

  it('routes every mention write through the definer RPC, never a client policy', () => {
    expect(migration).not.toMatch(/on public\.message_mentions for insert/i)
    expect(migration).not.toMatch(/on public\.message_mentions for update/i)
    expect(migration).not.toMatch(/on public\.message_mentions for delete/i)
    expect(migration).toContain('create policy "participants read message mentions"')
  })

  it('releases a device subscription on sign-out without touching other devices', () => {
    expect(migration).toContain('function public.revoke_push_subscription_by_endpoint(p_endpoint text)')
    expect(migration).toContain('and user_id = auth.uid()')
  })
})

describe('messaging push — service worker', () => {
  it('suppresses a notification when a focused window has the chat open', () => {
    expect(worker).toContain('RODINKA_IS_CONVERSATION_OPEN')
    expect(worker).toContain('if (await isConversationOpen(payload.conversationId)) return undefined')
  })

  it('bounds the focus probe so a silent tab cannot stall the push', () => {
    expect(worker).toContain('timeoutMs = 700')
    expect(worker).toContain('Promise.race')
  })

  it('hands a click to a live window instead of forcing a reload', () => {
    expect(worker).toContain('RODINKA_OPEN_CONVERSATION')
    expect(worker).toContain('clients.openWindow(targetUrl)')
  })

  it('still refuses off-origin deep links', () => {
    expect(worker).toContain("value.startsWith('//')")
    expect(worker).toContain('target.origin === scope.origin')
  })

  it('validates ids from the payload before using them', () => {
    expect(worker).toContain('/^[0-9a-f-]{36}$/i')
  })

  it('collapses a conversation burst into one notification', () => {
    expect(sender).toContain('rodinka-chat:')
    expect(sender).toContain("topic: (messagingContext?.conversationId ?? delivery.id)")
    expect(worker).toContain('renotify: payload.renotify')
  })

  it('keeps the app-shell fetch handler cloning before it returns the response', () => {
    // Regression guard: cloning after `return response` reintroduces
    // "Response body is already used".
    const navigate = worker.slice(worker.indexOf("request.mode === 'navigate'"), worker.indexOf('function safeDeepLink'))
    expect(navigate.indexOf('response.clone()')).toBeLessThan(navigate.indexOf('return response'))
    expect(worker).not.toContain('skipWaiting')
  })
})
