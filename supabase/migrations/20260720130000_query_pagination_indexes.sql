-- Targeted indexes for production-facing calendar, messaging pagination,
-- and reminder-center queries. These mirror the Supabase filters/orderings in
-- src/calendar/calendarSync.ts, src/context/messages/useMessagesDataSource.ts,
-- and src/context/ReminderContext.tsx.

-- Calendar snapshot: family-scoped activity lookups use start_date <= range_end,
-- order by start_date, and then apply overlap/status logic in application code.
create index if not exists activities_family_start_date_idx
  on public.activities (family_id, start_date, id);

-- Calendar snapshot: medical rows are family-scoped and ordered by record_date;
-- due/vaccine dates are currently filtered client-side after the bounded fetch.
create index if not exists medical_records_family_record_date_idx
  on public.medical_records (family_id, record_date, id);

-- Calendar snapshot: assignment history queries are family-scoped and bounded by
-- effective_from <= range_end. Existing lookup indexes are series-oriented.
create index if not exists series_assignment_history_family_effective_idx
  on public.series_assignment_history (family_id, effective_from desc, id);

create index if not exists activity_participant_history_family_effective_idx
  on public.activity_participant_history (family_id, effective_from desc, id);

-- Reminder center: active/history/unread state is loaded by family + target member
-- with newest generated reminders first and a hard 300-row cap. Existing reminder
-- indexes start at target_member_id only or focus on retention/server processing.
create index if not exists reminders_member_recent_idx
  on public.reminders (family_id, target_member_id, generated_at desc, id desc);

create index if not exists reminders_member_unread_active_idx
  on public.reminders (family_id, target_member_id, generated_at desc, id desc)
  where read_at is null and dismissed_at is null and resolved_at is null;
