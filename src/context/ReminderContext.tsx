import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { useFamilyData } from './FamilyDataContext'
import { reminderCopy } from '../notifications/reminderCopy'
import {
  DEFAULT_CATEGORY_PREFERENCES,
  defaultNotificationPreferences,
  generateReminderDrafts,
  reminderStatus,
  type NotificationPreferences,
  type ReminderCategory,
  type ReminderRecord,
} from '../notifications/reminders'
import { activeReminders, historyReminders, unreadActiveIds, unreadCount } from '../notifications/reminderPresentation'

interface ReminderContextValue {
  reminders: ReminderRecord[]
  active: ReminderRecord[]
  history: ReminderRecord[]
  unreadCount: number
  hasImportantUnread: boolean
  preferences: NotificationPreferences
  loading: boolean
  error: string | null
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  dismiss: (id: string) => Promise<void>
  savePreferences: (preferences: NotificationPreferences) => Promise<void>
  refresh: () => Promise<void>
}

const ReminderContext = createContext<ReminderContextValue | null>(null)

function mapPreferences(row: Record<string, unknown> | null, memberId: string, familyId: string): NotificationPreferences {
  const defaults = defaultNotificationPreferences(memberId, familyId)
  if (!row) return defaults
  const dailyDigestEnabled = Boolean(row.daily_digest_enabled)
  return {
    memberId,
    familyId,
    inAppEnabled: Boolean(row.in_app_enabled),
    pushEnabled: Boolean(row.push_enabled),
    dailyDigestEnabled,
    weeklyDigestEnabled: !dailyDigestEnabled && Boolean(row.weekly_digest_enabled),
    quietPushEnabled: Boolean(row.quiet_push_enabled),
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: String(row.quiet_hours_start ?? defaults.quietHoursStart).slice(0, 5),
    quietHoursEnd: String(row.quiet_hours_end ?? defaults.quietHoursEnd).slice(0, 5),
    timezone: String(row.timezone ?? defaults.timezone),
    categories: { ...DEFAULT_CATEGORY_PREFERENCES, ...((row.category_preferences as Partial<Record<ReminderCategory, boolean>> | null) ?? {}) },
  }
}

function mapReminder(row: Record<string, unknown>): ReminderRecord {
  const base = {
    id: String(row.id), familyId: String(row.family_id), targetMemberId: String(row.target_member_id),
    dedupeKey: String(row.dedupe_key), source: String(row.source) as ReminderRecord['source'], type: String(row.reminder_type),
    title: String(row.title), description: row.description ? String(row.description) : null,
    importance: String(row.importance) as ReminderRecord['importance'], eventAt: row.event_at ? String(row.event_at) : null,
    generatedAt: String(row.generated_at), expiresAt: row.expires_at ? String(row.expires_at) : null,
    deepLink: row.deep_link ? String(row.deep_link) : null, groupingKey: row.grouping_key ? String(row.grouping_key) : null,
    metadata: (row.metadata ?? { sourceIds: [] }) as ReminderRecord['metadata'], readAt: row.read_at ? String(row.read_at) : null,
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null, resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    lastSeenAt: String(row.last_seen_at),
  }
  return { ...base, status: reminderStatus(base) }
}

export function ReminderProvider({ children }: { children: ReactNode }) {
  const data = useFamilyData()
  const [reminders, setReminders] = useState<ReminderRecord[]>([])
  const [preferences, setPreferences] = useState(() => defaultNotificationPreferences(data.currentMember.id, data.familyId))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generationTick, setGenerationTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setGenerationTick((value) => value + 1), 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  const refresh = useCallback(async () => {
    const { data: rows, error: loadError } = await supabase.from('reminders').select('*').eq('target_member_id', data.currentMember.id).order('generated_at', { ascending: false }).limit(300)
    if (loadError) { console.error('Failed to load reminders:', loadError.message); setError('Připomínky se nepodařilo načíst.'); return }
    setReminders(((rows ?? []) as Record<string, unknown>[]).map(mapReminder))
    setError(null)
  }, [data.currentMember.id])

  useEffect(() => {
    let cancelled = false
    async function loadPreferences() {
      setLoading(true)
      const { data: row, error: loadError } = await supabase.from('notification_preferences').select('*').eq('member_id', data.currentMember.id).maybeSingle()
      if (cancelled) return
      if (loadError) {
        console.error('Failed to load reminder preferences:', loadError.message)
        setError('Nastavení připomínek se nepodařilo načíst.')
      } else {
        const next = mapPreferences(row as Record<string, unknown> | null, data.currentMember.id, data.familyId)
        if (!row) {
          const { error: insertError } = await supabase.from('notification_preferences').insert({
            member_id: next.memberId, family_id: next.familyId, timezone: next.timezone,
          })
          if (insertError) console.error('Failed to create reminder preferences:', insertError.message)
        }
        if (!cancelled) setPreferences(next)
      }
      await refresh()
      if (!cancelled) setLoading(false)
    }
    loadPreferences()
    return () => { cancelled = true }
  }, [data.currentMember.id, data.familyId, refresh])

  const drafts = useMemo(() => {
    void generationTick
    return generateReminderDrafts({
    familyId: data.familyId, currentMember: data.currentMember, isParentOrAdmin: data.isParentOrAdmin,
    members: data.members, chores: data.chores, latestCompletionFor: data.latestCompletionFor,
    activities: data.activities, medicalRecords: data.medicalRecords, voteRounds: data.voteRounds,
    planEntries: data.planEntries, pendingCompletions: data.pendingCompletions, shoppingItems: data.shoppingItems,
      preferences, copy: reminderCopy, now: new Date(),
    })
  }, [data.familyId, data.currentMember, data.isParentOrAdmin, data.members, data.chores, data.latestCompletionFor, data.activities, data.medicalRecords, data.voteRounds, data.planEntries, data.pendingCompletions, data.shoppingItems, preferences, generationTick])

  const draftSignature = useMemo(() => drafts.map((item) => item.dedupeKey).sort().join('|'), [drafts])
  useEffect(() => {
    if (data.loading || loading) return
    let cancelled = false
    async function sync() {
      const { error: syncError } = await supabase.rpc('sync_member_reminders', { p_family_id: data.familyId, p_reminders: drafts })
      if (!cancelled) {
        if (syncError) { console.error('Failed to sync reminders:', syncError.message); setError('Připomínky se nepodařilo aktualizovat.') }
        else await refresh()
      }
    }
    sync()
    return () => { cancelled = true }
  }, [data.familyId, data.loading, draftSignature, drafts, loading, refresh])

  const updateTimestamp = useCallback(async (ids: string[], field: 'read_at' | 'dismissed_at') => {
    if (ids.length === 0) return
    const timestamp = new Date().toISOString()
    const { error: updateError } = await supabase.from('reminders').update({ [field]: timestamp, updated_at: timestamp }).in('id', ids).eq('target_member_id', data.currentMember.id)
    if (updateError) throw new Error('Připomínku se nepodařilo uložit.')
    setReminders((items) => items.map((item) => {
      if (!ids.includes(item.id)) return item
      const next = { ...item, readAt: field === 'read_at' ? timestamp : item.readAt, dismissedAt: field === 'dismissed_at' ? timestamp : item.dismissedAt }
      return { ...next, status: reminderStatus(next) }
    }))
  }, [data.currentMember.id])

  const markRead = useCallback((id: string) => updateTimestamp([id], 'read_at'), [updateTimestamp])
  const markAllRead = useCallback(() => updateTimestamp(unreadActiveIds(reminders), 'read_at'), [reminders, updateTimestamp])
  const dismiss = useCallback((id: string) => updateTimestamp([id], 'dismissed_at'), [updateTimestamp])

  const savePreferences = useCallback(async (next: NotificationPreferences) => {
    const { error: saveError } = await supabase.from('notification_preferences').upsert({
      member_id: data.currentMember.id, family_id: data.familyId, in_app_enabled: next.inAppEnabled,
      push_enabled: false, daily_digest_enabled: next.dailyDigestEnabled, weekly_digest_enabled: next.weeklyDigestEnabled,
      quiet_push_enabled: next.quietPushEnabled, quiet_hours_enabled: next.quietHoursEnabled,
      quiet_hours_start: next.quietHoursStart, quiet_hours_end: next.quietHoursEnd, timezone: next.timezone,
      category_preferences: next.categories, updated_at: new Date().toISOString(),
    })
    if (saveError) throw new Error('Nastavení se nepodařilo uložit.')
    setPreferences({ ...next, pushEnabled: false })
  }, [data.currentMember.id, data.familyId])

  const active = useMemo(() => activeReminders(reminders), [reminders])
  const history = useMemo(() => historyReminders(reminders), [reminders])
  const count = unreadCount(reminders)
  const hasImportantUnread = active.some((item) => !item.readAt && item.importance === 'important')

  return <ReminderContext.Provider value={{ reminders, active, history, unreadCount: count, hasImportantUnread, preferences, loading, error, markRead, markAllRead, dismiss, savePreferences, refresh }}>{children}</ReminderContext.Provider>
}

export function useReminders() {
  const context = useContext(ReminderContext)
  if (!context) throw new Error('useReminders must be used within ReminderProvider')
  return context
}
