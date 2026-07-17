-- Fix permanent deletion of removed members to delete notification preferences from the current family.

create or replace function permanently_delete_removed_member(p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target members%rowtype;
  actor members%rowtype;
  v_avatar_path text;
begin
  select * into target from members where id = p_member_id for update;
  if target.id is null then
    raise exception 'Member not found';
  end if;

  select * into actor from members where family_id = target.family_id and user_id = auth.uid() and status = 'active';
  if actor.id is null or actor.role not in ('admin','parent') then
    raise exception 'Not authorized to manage household members';
  end if;
  if actor.id = target.id then
    raise exception 'Current member cannot be permanently deleted';
  end if;
  if target.status <> 'removed' then
    raise exception 'Only removed members can be permanently deleted';
  end if;

  if exists (select 1 from chores where family_id = target.family_id and status = 'active' and assigned_to = target.id) then
    raise exception 'Unsafe active references remain for this member';
  end if;
  if exists (select 1 from activities where family_id = target.family_id and status = 'active' and (responsible_member_id = target.id or secondary_responsible_member_id = target.id or child_id = target.id)) then
    raise exception 'Unsafe active references remain for this member';
  end if;
  if exists (select 1 from activity_participants ap join activities a on a.id = ap.activity_id where a.family_id = target.family_id and a.status = 'active' and ap.member_id = target.id) then
    raise exception 'Unsafe active references remain for this member';
  end if;
  if exists (select 1 from occurrence_overrides where family_id = target.family_id and occurrence_date >= current_date and (companion_member_id = target.id or assignee_member_id = target.id)) then
    raise exception 'Unsafe active references remain for this member';
  end if;

  v_avatar_path := target.avatar_path;

  update chores set created_by_member_id = null where family_id = target.family_id and created_by_member_id = target.id;
  update chore_completions set completed_by = null where completed_by = target.id;
  update chore_completions set approved_by = null where approved_by = target.id;
  update chore_completions set assigned_member_id = null where assigned_member_id = target.id;
  update allowance_ledger set member_id = null where family_id = target.family_id and member_id = target.id;
  update activities set responsible_member_id = null where family_id = target.family_id and responsible_member_id = target.id;
  update activities set secondary_responsible_member_id = null where family_id = target.family_id and secondary_responsible_member_id = target.id;
  update activities set child_id = null where family_id = target.family_id and child_id = target.id;
  delete from activity_participants using activities a where activity_participants.activity_id = a.id and a.family_id = target.family_id and activity_participants.member_id = target.id;
  update medical_records set patient_id = null where family_id = target.family_id and patient_id = target.id;
  update medical_records set responsible_member_id = null where family_id = target.family_id and responsible_member_id = target.id;
  update shopping_items set created_by_member_id = null where family_id = target.family_id and created_by_member_id = target.id;
  update shopping_items set responsible_member_id = null where family_id = target.family_id and responsible_member_id = target.id;
  update shopping_items set purchased_by_member_id = null where family_id = target.family_id and purchased_by_member_id = target.id;
  update meal_plan_entries set responsible_member_id = null where family_id = target.family_id and responsible_member_id = target.id;
  update occurrence_overrides set companion_member_id = null, updated_at = now() where family_id = target.family_id and companion_member_id = target.id;
  update occurrence_overrides set assignee_member_id = null, updated_at = now() where family_id = target.family_id and assignee_member_id = target.id;
  update series_assignment_history set member_id = null where family_id = target.family_id and member_id = target.id;
  update series_assignment_history set changed_by_member_id = null where family_id = target.family_id and changed_by_member_id = target.id;
  update activity_participant_history set member_id = null where family_id = target.family_id and member_id = target.id;
  update member_removal_audit set member_id = null where family_id = target.family_id and member_id = target.id;
  update member_removal_audit set replacement_member_id = null where family_id = target.family_id and replacement_member_id = target.id;
  update members set removed_by_member_id = null where family_id = target.family_id and removed_by_member_id = target.id;
  update members set restored_by_member_id = null where family_id = target.family_id and restored_by_member_id = target.id;
  delete from reminders where target_member_id = target.id;
  delete from notification_preferences where member_id = target.id and family_id = target.family_id;
  update push_subscriptions set revoked_at = now(), disabled_at = now() where target_member_id = target.id and revoked_at is null;
  update notification_deliveries set status = 'cancelled', error_code = 'member_deleted' where target_member_id = target.id and status in ('pending','failed','processing');

  delete from members where id = target.id;
  return jsonb_build_object('status', 'deleted', 'avatar_path', v_avatar_path);
end;
$$;

revoke all on function permanently_delete_removed_member(uuid) from public;
grant execute on function permanently_delete_removed_member(uuid) to authenticated;
