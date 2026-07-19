# Supabase query optimization audit: calendar, chat, notifications

This audit is derived from the production-facing Supabase calls in `src/calendar/calendarSync.ts`, `src/context/messages/useMessagesDataSource.ts`, and `src/context/ReminderContext.tsx`, plus current migrations under `supabase/migrations`.

## Calendar queries

Calendar daily, weekly, and monthly views all consume the same offline calendar snapshot. There is no separate daily/weekly/monthly Supabase query and no adjacent-view prefetch query in the current codebase; `fetchCalendarSnapshot()` loads a rolling range from the first day six months before the current UTC month through the last day twelve months after the current UTC month.

| Source | Table | Columns/relations | Filters | Order/limit | Pagination | Existing relevant indexes | Expected size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Calendar snapshot | `chores` | explicit task columns | `family_id = ?`, `due_date between range_start and range_end` | `due_date asc`, `limit 1500` | bounded range, no cursor | `chores_family_status_due_idx`, `chores_family_manual_order_idx` | up to 1,500 rows for 19 months |
| Calendar snapshot | `chore_completions` | completion columns with `chores!inner(family_id)` | joined chore `family_id = ?`, `occurrence_due_date between range_start and range_end` | `completed_at desc`, `limit 2000` | bounded range, no cursor | `chore_completions_chore_occurrence_idx` | up to 2,000 rows |
| Calendar snapshot | `activities` | explicit activity columns plus `activity_participants(member_id)` | `family_id = ?`, `start_date <= range_end`; app filters active/overlap | `start_date asc`, `limit 1500` | bounded range, no cursor | `activities_family_id_idx`, `activities_child_id_idx` | up to 1,500 candidate rows |
| Calendar snapshot | `medical_records` | explicit medical columns | `family_id = ?`; app filters record/due/vaccine dates | `record_date asc`, `limit 1500` | capped family history, no cursor | `medical_records_family_id_idx`, `medical_records_patient_id_idx` | up to 1,500 candidate rows |
| Calendar snapshot | `meal_plan_entries` | explicit meal-plan columns | `family_id = ?`, `entry_date between range_start and range_end` | `entry_date asc`, `limit 1500` | bounded range, no cursor | `meal_plan_entries_family_id_date_idx` | up to 1,500 rows |
| Calendar snapshot | `allowance_plans` | plan columns plus `allowance_plan_requirements(...)` | `family_id = ?` | `created_at asc`, `limit 500` | capped family plans, no cursor | `allowance_plans_family_id_idx` | small; one/few per child |
| Calendar snapshot | `occurrence_overrides` | explicit override columns | `family_id = ?`, `occurrence_date between range_start and range_end` | none, `limit 2000` | bounded range, no cursor | `occurrence_overrides_family_date_idx` | up to 2,000 rows |
| Calendar snapshot | `series_assignment_history` | explicit assignment-history columns | `family_id = ?`, `effective_from <= range_end` | none, `limit 2000` | bounded by effective date, no cursor | `series_assignment_history_lookup_idx` | up to 2,000 rows |
| Calendar snapshot | `activity_participant_history` | explicit participant-history columns | `family_id = ?`, `effective_from <= range_end` | none, `limit 2000` | bounded by effective date, no cursor | `activity_participant_history_lookup_idx` | up to 2,000 rows |
| Calendar snapshot | `members` | explicit member columns | `family_id = ?` | `display_name asc`, `limit 500` | capped family roster, no cursor | `members_family_status_idx` | small household roster |

## Chat queries

| Source | Table/RPC | Columns/relations | Filters | Order/limit | Pagination | Existing relevant indexes | Expected size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Initial messaging load | `ensure_family_group_conversation` RPC | group conversation id side effect | `p_family_id` | n/a | n/a | `conversations_family_group_unique` | one row |
| Conversation list | `conversations` | explicit conversation summary columns | `family_id = ?` | `last_message_at desc nulls last` | none | `conversations_family_recent_idx` | family-wide + direct conversations visible by RLS |
| Conversation membership/read state | `conversation_members` | conversation/member/read/mute columns | RLS only in client query | none | none | `conversation_members_member_idx`, PK | one row per participant/conversation visible by RLS |
| Chat history initial page | `messages` | `MESSAGE_SELECT_COLUMNS` | `conversation_id = ?` | `created_at desc`, `id desc`, `limit 60` | first page | `messages_conversation_recent_idx` | 60 newest messages |
| Load older messages | `messages` | `MESSAGE_SELECT_COLUMNS` | `conversation_id = ?`, keyset cursor before `(created_at, id)` | `created_at desc`, `id desc`, `limit 40` | keyset cursor | `messages_conversation_recent_idx` | 40 older messages |
| Extras hydration | `message_reactions` | reaction columns | `message_id in (...)` | none | page-sized batch | `message_reactions_message_idx` | reactions for 40-60 messages |
| Extras hydration | `message_attachments` | attachment columns | `message_id in (...)` | none | page-sized batch | `message_attachments_message_idx` | attachments for 40-60 messages |
| Mark read | `mark_conversation_read` RPC | update only | conversation id + actor member | n/a | monotonic timestamp cursor | PK on `conversation_members` | one row update |
| Direct conversation | `ensure_direct_conversation` RPC | direct conversation row | other member id | n/a | n/a | `conversations_family_direct_unique` | one row |

## Notification/reminder queries

| Source | Table/RPC | Columns/relations | Filters | Order/limit | Pagination | Existing relevant indexes | Expected size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Reminder center list | `reminders` | `*` | `family_id = ?`, `target_member_id = ?` | `generated_at desc`, `limit 300` | newest capped history, no cursor | `reminders_active_member_idx`, `reminders_history_member_idx`, `reminders_active_event_idx`, `reminders_retention_idx` | up to 300 rows |
| Unread count/state | local derivation from loaded reminders | same loaded rows | active + `read_at is null` in app | n/a | no DB count query today | same as list | subset of 300 rows |
| Mark read/dismiss | `set_member_reminder_state` RPC | update only | `family_id`, actor `target_member_id`, `id = any(ids)`, state null checks | n/a | max 300 IDs per call | reminder PK plus existing state indexes | up to 300 row updates |
| Preferences | `notification_preferences` | `*` | `member_id = ?`, `family_id = ?` | `maybeSingle()` | n/a | PK on `member_id`, `notification_preferences_family_idx` | one row |

## Representative EXPLAIN queries

Use a local/staging database with representative family data and replace the IDs/dates:

```sql
explain (analyze, buffers)
select id, family_id, title, due_date
from public.chores
where family_id = :'family_id'
  and due_date >= date '2026-01-01'
  and due_date <= date '2027-07-31'
order by due_date
limit 1500;

explain (analyze, buffers)
select id, conversation_id, family_id, sender_member_id, content_type, body,
       client_id, reply_to_message_id, system_kind, edited_at, deleted_at,
       has_attachments, created_at
from public.messages
where conversation_id = :'conversation_id'
  and ((created_at < :'cursor_created_at'::timestamptz)
       or (created_at = :'cursor_created_at'::timestamptz and id < :'cursor_id'::uuid))
order by created_at desc, id desc
limit 40;

explain (analyze, buffers)
select *
from public.reminders
where family_id = :'family_id'
  and target_member_id = :'member_id'
order by generated_at desc
limit 300;
```

## Optimizations prepared

- Added family/date indexes for calendar sources where existing indexes were either family-only or series-lookup oriented.
- Added reminder list and unread-active partial indexes matching the reminder center filters and derived unread state.
- Tightened older chat pagination from `created_at < cursor` to a deterministic `(created_at, id)` keyset cursor to avoid skipping rows that share the same timestamp as the cursor.
- Did not add duplicate chat history indexes because `messages_conversation_recent_idx` already matches the conversation history order.
