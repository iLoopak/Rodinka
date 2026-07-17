import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The account management UI makes promises to parents — "access stops now",
// "history is kept", "restoring does not restore the password". Those are all
// enforced server-side, so this pins the guarantees the UI is allowed to make.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const security = read('../supabase/migrations/20260717230000_child_accounts_batch1_security.sql')
const removal = read('../supabase/migrations/20260714160000_household_tasks_occurrence_overrides_member_removal.sql')
const reminders = read('../supabase/migrations/20260714130000_server_reminder_processing.sql')
const edge = read('../supabase/functions/manage-child-account/index.ts')

describe('managed child account lifecycle boundary', () => {
  it('rejects a target outside the caller family, an adult, or an inactive member', () => {
    // The UI hides these actions, but hiding is not authorization: the Edge
    // Function re-derives the family from the caller's own member row.
    const target = edge.slice(edge.indexOf('const { data: targetData }'), edge.indexOf('const target = targetData'))
    expect(target).toContain(".eq('family_id', actor.family_id)")
    expect(target).toContain(".eq('role', 'child')")
    expect(target).toContain(".eq('status', 'active')")
  })

  it('requires an active adult actor and never trusts a client-supplied identity', () => {
    expect(edge).toContain("if (!actor || !['admin', 'parent'].includes(actor.role)) return json(403")
    expect(edge).toMatch(/Object\.keys\(input\)\.some\(\(key\) => !\['action', 'memberId', 'loginName', 'password'\]/)
  })

  it('serializes concurrent provisioning through row locks', () => {
    // Two adults acting at once must not both reserve the same child.
    const provision = security.slice(
      security.indexOf('function public.begin_child_account_provision'),
      security.indexOf('function public.finalize_child_account_provision'),
    )
    expect(provision).toContain('from public.members where id = p_member_id for update')
    expect(provision).toContain('from public.child_accounts where member_id = target.id for update')
    expect(provision).toContain("if account.status in ('provisioning', 'active') then raise exception")
    expect(provision).toContain('if target.user_id is not null then raise exception')
  })

  it('reports a failed Auth deletion as blocked access rather than a failed revoke', () => {
    // Partial cleanup: family access is already gone once the row is detached.
    const revoke = edge.slice(edge.indexOf("service.rpc('detach_child_account_access'"))
    expect(revoke).toContain("cleanupPending: Boolean(deleteError)")
    expect(revoke).toContain("ok: true, status: 'revoked'")
  })

  it('detaches access and disables push in one transaction on revoke', () => {
    const detach = security.slice(
      security.indexOf('function public.detach_child_account_access'),
      security.indexOf('function public.mark_detached_child_account_revoked'),
    )
    expect(detach).toContain('update public.members set removed_user_id = coalesce(user_id, removed_user_id), user_id = null')
    expect(detach).toContain('update public.push_subscriptions set revoked_at = coalesce(revoked_at, now())')
    // Revocation is not deletion: no family history is touched here.
    expect(detach).not.toMatch(/delete from public\.(chores|chore_completions|allowance_ledger|activities)/)
  })

  it('stops queueing new notifications for a member without an auth link', () => {
    // A revoked child keeps their reminders, but nothing new is scheduled for
    // them, and the sender skips revoked devices.
    expect(reminders).toContain('where m.user_id is not null')
  })

  it('removes a child by detaching the auth link and cancelling notification work', () => {
    const remove = removal.slice(
      removal.indexOf('function remove_household_member'),
      removal.indexOf('function restore_household_member'),
    )
    expect(remove).toContain('removed_user_id=user_id, user_id=null')
    expect(remove).toContain("update push_subscriptions set revoked_at=now(), disabled_at=now()")
    expect(remove).toContain("update notification_deliveries set status='cancelled', error_code='member_removed'")
  })

  it('restores a member without restoring their credentials', () => {
    const restore = removal.slice(removal.indexOf('function restore_household_member'))
    expect(restore).toContain("update members set status='active'")
    // The guarantee is that restoring writes no auth link back: removal parked
    // the old id in removed_user_id, and nothing here reads it. An adult has to
    // create access again explicitly.
    const restoreWrite = /update members set([\s\S]*?)where id=target\.id;/.exec(restore)?.[1] ?? ''
    expect(restoreWrite).not.toBe('')
    expect(restoreWrite).not.toContain('user_id')
    expect(restore).toContain("'access_restored',false")
  })

  it('marks a detached or deactivated child account revoked by trigger', () => {
    expect(security).toContain('create trigger members_detach_child_account after update of user_id, status on public.members')
  })
})
