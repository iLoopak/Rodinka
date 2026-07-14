import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { useFamilyData } from './FamilyDataContext'
import { reminderCopy } from '../notifications/reminderCopy'
import {
  DEFAULT_CATEGORY_PREFERENCES,
  browserTimezone,
  defaultNotificationPreferences,
  generateReminderDrafts,
  isValidTimeZone,
  reminderStatus,
  type NotificationPreferences,
  type ReminderCategory,
  type ReminderRecord,
} from '../notifications/reminders'
import { activeReminders, historyReminders, unreadActiveIds, unreadCount } from '../notifications/reminderPresentation'
import {
  buildReminderSourceFingerprint,
  parseReminderInvalidation,
  REMINDER_FOREGROUND_REFRESH_MS,
  REMINDER_INVALIDATION_KEY,
  shouldRefreshAfterBackground,
  type ReminderInvalidationKind,
} from '../notifications/reminderLifecycle'

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
  const storedTimezone = String(row.timezone ?? defaults.timezone)
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
    timezone: isValidTimeZone(storedTimezone) ? storedTimezone : 'UTC',
    timezoneMode: row.timezone_mode === 'explicit' ? 'explicit' : 'auto',
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
  const refreshSourceData = data.refreshReminderSources
  const [reminders, setReminders] = useState<ReminderRecord[]>([])
  const [preferences, setPreferences] = useState(() => defaultNotificationPreferences(data.currentMember.id, data.familyId))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generationTick, setGenerationTick] = useState(0)
  const hiddenAt = useRef<number | null>(null)
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const lastSourceRefreshAt = useRef(0)
  const senderId = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  const lastBroadcastFingerprint = useRef<string | null>(null)

  const broadcastInvalidation = useCallback((kind: ReminderInvalidationKind, fingerprint?: string) => {
    try {
      localStorage.setItem(REMINDER_INVALIDATION_KEY, JSON.stringify({
        kind, familyId: data.familyId, memberId: data.currentMember.id,
        senderId: senderId.current, fingerprint, at: Date.now(),
      }))
    } catch {
      // Storage can be unavailable in private browsing; visibility refresh is the fallback.
    }
  }, [data.currentMember.id, data.familyId])

  const refresh = useCallback(async () => {
    const { data: rows, error: loadError } = await supabase
      .from('reminders')
      .select('*')
      .eq('family_id', data.familyId)
      .eq('target_member_id', data.currentMember.id)
      .order('generated_at', { ascending: false })
      .limit(300)
    if (loadError) {
      console.error('Failed to load reminders:', loadError.message)
      setError('Připomínky se nepodařilo načíst.')
      return
    }
    setReminders(((rows ?? []) as Record<string, unknown>[]).map(mapReminder))
    setError(null)
  }, [data.currentMember.id, data.familyId])

  const loadPreferences = useCallback(async () => {
    const { data: row, error: loadError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('member_id', data.currentMember.id)
      .eq('family_id', data.familyId)
      .maybeSingle()
    if (loadError) {
      console.error('Failed to load reminder preferences:', loadError.message)
      setError('Nastavení připomínek se nepodařilo načíst.')
      return
    }

    let next = mapPreferences(row as Record<string, unknown> | null, data.currentMember.id, data.familyId)
    const detectedTimezone = browserTimezone()
    if (next.timezoneMode === 'auto' && next.timezone !== detectedTimezone) next = { ...next, timezone: detectedTimezone }

    if (!row) {
      const { error: insertError } = await supabase.from('notification_preferences').upsert({
        member_id: next.memberId, family_id: next.familyId, timezone: next.timezone, timezone_mode: next.timezoneMode,
      }, { onConflict: 'member_id', ignoreDuplicates: true })
      if (insertError) console.error('Failed to create reminder preferences:', insertError.message)
    } else if (String(row.timezone) !== next.timezone || row.timezone_mode !== next.timezoneMode) {
      const { error: timezoneError } = await supabase.from('notification_preferences').update({
        timezone: next.timezone, timezone_mode: next.timezoneMode, updated_at: new Date().toISOString(),
      }).eq('member_id', next.memberId).eq('family_id', next.familyId)
      if (timezoneError) console.error('Failed to normalize reminder timezone:', timezoneError.message)
    }
    setPreferences(next)
  }, [data.currentMember.id, data.familyId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setReminders([])
    setPreferences(defaultNotificationPreferences(data.currentMember.id, data.familyId))
    lastBroadcastFingerprint.current = null
    Promise.all([loadPreferences(), refresh()]).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [data.currentMember.id, data.familyId, loadPreferences, refresh])

  const sourceFingerprint = useMemo(() => buildReminderSourceFingerprint({
    members: data.members, chores: data.chores, completions: data.completions, activities: data.activities,
    medicalRecords: data.medicalRecords, voteRounds: data.voteRounds,
    planEntries: data.planEntries, shoppingItems: data.shoppingItems,
  }), [data.members, data.chores, data.completions, data.activities, data.medicalRecords, data.voteRounds, data.planEntries, data.shoppingItems])

  const refreshSources = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastSourceRefreshAt.current < 30_000) return
    if (refreshInFlight.current) return refreshInFlight.current
    lastSourceRefreshAt.current = now
    const operation = (async () => {
      await Promise.all([refreshSourceData(), refresh()])
      setGenerationTick((value) => value + 1)
    })().finally(() => { refreshInFlight.current = null })
    refreshInFlight.current = operation
    return operation
  }, [refresh, refreshSourceData])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
      } else {
        const shouldRefresh = shouldRefreshAfterBackground(hiddenAt.current, Date.now())
        hiddenAt.current = null
        if (shouldRefresh) void refreshSources(true)
      }
    }
    function onOnline() { if (document.visibilityState === 'visible') void refreshSources(true) }
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshSources()
    }, REMINDER_FOREGROUND_REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [refreshSources])

  useEffect(() => {
    if (data.loading) return
    if (lastBroadcastFingerprint.current === null) {
      lastBroadcastFingerprint.current = sourceFingerprint
      return
    }
    if (lastBroadcastFingerprint.current !== sourceFingerprint) {
      lastBroadcastFingerprint.current = sourceFingerprint
      broadcastInvalidation('sources', sourceFingerprint)
    }
  }, [broadcastInvalidation, data.loading, sourceFingerprint])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== REMINDER_INVALIDATION_KEY) return
      const message = parseReminderInvalidation(event.newValue)
      if (!message || message.senderId === senderId.current || message.familyId !== data.familyId) return
      if (message.kind === 'sources' && message.fingerprint !== sourceFingerprint) void refreshSources(true)
      if (message.kind !== 'sources' && message.memberId !== data.currentMember.id) return
      if (message.kind === 'state') void refresh()
      if (message.kind === 'preferences') void loadPreferences().then(() => setGenerationTick((value) => value + 1))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [data.currentMember.id, data.familyId, loadPreferences, refresh, refreshSources, sourceFingerprint])

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

  useEffect(() => {
    if (data.loading || loading) return
    let cancelled = false
    async function sync() {
      const { error: syncError } = await supabase.rpc('sync_member_reminders', { p_family_id: data.familyId, p_reminders: drafts })
      if (!cancelled) {
        if (syncError) {
          console.error('Failed to sync reminders:', syncError.message)
          setError('Připomínky se nepodařilo aktualizovat.')
        } else {
          await refresh()
        }
      }
    }
    void sync()
    return () => { cancelled = true }
  }, [data.familyId, data.loading, drafts, loading, refresh])

  const updateState = useCallback(async (ids: string[], action: 'read' | 'dismiss') => {
    if (ids.length === 0) return
    const timestamp = new Date().toISOString()
    const { error: updateError } = await supabase.rpc('set_member_reminder_state', {
      p_family_id: data.familyId, p_reminder_ids: ids, p_action: action,
    })
    if (updateError) throw new Error('Připomínku se nepodařilo uložit.')
    setReminders((items) => items.map((item) => {
      if (!ids.includes(item.id)) return item
      const next = { ...item, readAt: action === 'read' ? (item.readAt ?? timestamp) : item.readAt, dismissedAt: action === 'dismiss' ? (item.dismissedAt ?? timestamp) : item.dismissedAt }
      return { ...next, status: reminderStatus(next) }
    }))
    broadcastInvalidation('state')
  }, [broadcastInvalidation, data.familyId])

  const markRead = useCallback((id: string) => updateState([id], 'read'), [updateState])
  const markAllRead = useCallback(() => updateState(unreadActiveIds(reminders), 'read'), [reminders, updateState])
  const dismiss = useCallback((id: string) => updateState([id], 'dismiss'), [updateState])

  const savePreferences = useCallback(async (next: NotificationPreferences) => {
    if (!isValidTimeZone(next.timezone)) throw new Error('Vyberte platné časové pásmo.')
    const normalized = next.timezoneMode === 'auto' ? { ...next, timezone: browserTimezone() } : next
    const { error: saveError } = await supabase.from('notification_preferences').upsert({
      member_id: data.currentMember.id, family_id: data.familyId, in_app_enabled: normalized.inAppEnabled,
      push_enabled: false, daily_digest_enabled: normalized.dailyDigestEnabled, weekly_digest_enabled: normalized.weeklyDigestEnabled,
      quiet_push_enabled: normalized.quietPushEnabled, quiet_hours_enabled: normalized.quietHoursEnabled,
      quiet_hours_start: normalized.quietHoursStart, quiet_hours_end: normalized.quietHoursEnd,
      timezone: normalized.timezone, timezone_mode: normalized.timezoneMode,
      category_preferences: normalized.categories, updated_at: new Date().toISOString(),
    })
    if (saveError) throw new Error('Nastavení se nepodařilo uložit.')
    setPreferences({ ...normalized, pushEnabled: false })
    broadcastInvalidation('preferences')
  }, [broadcastInvalidation, data.currentMember.id, data.familyId])

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
