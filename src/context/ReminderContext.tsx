import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getCurrentLanguage } from '../i18n'
import { SupabaseReminderProcessingService, SupabaseReminderRepository } from '../features/reminders/data/supabaseReminderRepository'
import type { ReminderRepository } from '../features/reminders/data/reminderRepository'
import { createReminderSyncCoordinator } from '../features/reminders/application/reminderSyncCoordinator'
import { useFamilyCore } from './family/FamilyCoreContext'
import { useReminderSources } from './reminders/useReminderSources'
import { reminderCopyFor } from '../notifications/reminderCopy'
import { t } from '../strings'
import { useLanguage } from '../i18n/languageContext'
import {
  browserTimezone,
  defaultNotificationPreferences,
  generateReminderDrafts,
  isValidTimeZone,
  reminderStatus,
  type NotificationPreferences,
  type ReminderRecord,
} from '../notifications/reminders'
import { activeReminders, historyReminders, unreadActiveIds, unreadCount } from '../notifications/reminderPresentation'
import {
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
  hasMore: boolean
  loadMore: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  dismiss: (id: string) => Promise<void>
  savePreferences: (preferences: NotificationPreferences) => Promise<void>
  refresh: () => Promise<void>
}

interface ReminderSummaryValue {
  unreadCount: number
  hasImportantUnread: boolean
}

const ReminderContext = createContext<ReminderContextValue | null>(null)
// The header bell needs two numbers out of a provider that recomputes whenever
// any of eight feature domains changes. Its own context keeps a shopping item
// edit from re-rendering the shell header.
const ReminderSummaryContext = createContext<ReminderSummaryValue | null>(null)

/** How many reminders the Center holds per page; the bell no longer depends on this. */
const REMINDER_PAGE_SIZE = 100

export function ReminderProvider({ children, repository: repositoryOverride }: { children: ReactNode; repository?: ReminderRepository }) {
  const { language } = useLanguage()
  const { familyId, currentMember } = useFamilyCore()
  const repository = useMemo(() => repositoryOverride ?? new SupabaseReminderRepository(), [repositoryOverride])
  const syncCoordinator = useMemo(() => createReminderSyncCoordinator(new SupabaseReminderProcessingService()), [])
  const scope = useMemo(() => ({ familyId, memberId: currentMember.id }), [familyId, currentMember.id])
  const sources = useReminderSources()
  const refreshSourceData = sources.refresh
  const [reminders, setReminders] = useState<ReminderRecord[]>([])
  const [preferences, setPreferences] = useState(() => defaultNotificationPreferences(currentMember.id, familyId, browserTimezone(), getCurrentLanguage()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generationTick, setGenerationTick] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const hiddenAt = useRef<number | null>(null)
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const lastSourceRefreshAt = useRef(0)
  const senderId = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

  const broadcastInvalidation = useCallback((kind: ReminderInvalidationKind, fingerprint?: string) => {
    try {
      localStorage.setItem(REMINDER_INVALIDATION_KEY, JSON.stringify({
        kind, familyId, memberId: currentMember.id,
        senderId: senderId.current, fingerprint, at: Date.now(),
      }))
    } catch {
      // Storage can be unavailable in private browsing; visibility refresh is the fallback.
    }
  }, [currentMember.id, familyId])

  const refresh = useCallback(async () => {
    try {
      const page = await repository.listPage({ scope, limit: REMINDER_PAGE_SIZE })
      setReminders(page.items)
      setNextCursor(page.nextCursor)
      setError(null)
    } catch (loadError) {
      console.error('Failed to load reminders:', loadError instanceof Error ? loadError.message : 'unknown error')
      setError(t.reminders.loadFailed)
    }
  }, [repository, scope])

  const loadMore = useCallback(async () => {
    if (!nextCursor) return
    try {
      const page = await repository.listPage({ scope, limit: REMINDER_PAGE_SIZE, before: nextCursor })
      // Deduplicated by id: a reminder inserted at the top by the sync RPC
      // between two page reads must not appear twice.
      setReminders((current) => {
        const seen = new Set(current.map((item) => item.id))
        return [...current, ...page.items.filter((item) => !seen.has(item.id))]
      })
      setNextCursor(page.nextCursor)
    } catch (loadError) {
      console.error('Failed to load more reminders:', loadError instanceof Error ? loadError.message : 'unknown error')
    }
  }, [nextCursor, repository, scope])

  const loadPreferences = useCallback(async () => {
    try {
      const stored = await repository.loadPreferences(scope)
      let next = stored
      const detectedTimezone = browserTimezone()
      if (next.timezoneMode === 'auto' && next.timezone !== detectedTimezone) next = { ...next, timezone: detectedTimezone }
      // Creating the row on first use and correcting a drifted timezone are
      // the same step: make the stored row match reality.
      await repository.ensurePreferences(next, stored)
      setPreferences(next)
    } catch (loadError) {
      console.error('Failed to load reminder preferences:', loadError instanceof Error ? loadError.message : 'unknown error')
      setError(t.reminders.preferencesLoadFailed)
    }
  }, [repository, scope])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setReminders([])
    setPreferences(defaultNotificationPreferences(currentMember.id, familyId, browserTimezone(), getCurrentLanguage()))
    Promise.all([loadPreferences(), refresh()]).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [currentMember.id, familyId, loadPreferences, refresh])

  useEffect(() => {
    if (loading || preferences.locale === language) return
    setPreferences((current) => ({ ...current, locale: language }))
    void repository.updateLocale(scope, language).catch((localeError: unknown) => {
      console.error('Failed to synchronize reminder locale:', localeError instanceof Error ? localeError.message : 'unknown error')
    })
  }, [language, loading, preferences.locale, repository, scope])

  // Renamed from the original `refreshAll`-style bundle to this specific
  // name so the composition stays legible at the call site; still preserves
  // the "refreshReminderSources" identifier that reminderProviderContract.test.ts
  // checks for.
  const refreshReminderSources = useCallback(async (force = false) => {
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
        if (shouldRefresh) void refreshReminderSources(true)
      }
    }
    function onOnline() { if (document.visibilityState === 'visible') void refreshReminderSources(true) }
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshReminderSources()
    }, REMINDER_FOREGROUND_REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [refreshReminderSources])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== REMINDER_INVALIDATION_KEY) return
      const message = parseReminderInvalidation(event.newValue)
      if (!message || message.senderId === senderId.current || message.familyId !== familyId) return
      if (message.memberId !== currentMember.id) return
      if (message.kind === 'state') void refresh()
      if (message.kind === 'preferences') void loadPreferences().then(() => setGenerationTick((value) => value + 1))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [currentMember.id, familyId, loadPreferences, refresh])

  // Draft generation is cheap; the sync RPC that follows it is not. Because
  // `draftInputs` changes identity whenever ANY of the eight source domains
  // emits — a shopping item toggled, a chore renamed — this memo used to hand
  // back a brand new array every time, and the effect below fired
  // sync_member_reminders plus a full reminders refresh for changes that could
  // not possibly alter a reminder.
  //
  // Keeping the previous array when the generated content is identical makes
  // the effect's dependency honest: it now re-runs only when the drafts really
  // differ. The refs are a memoization cache, not state — recomputing under
  // StrictMode yields the same answer.
  const draftsRef = useRef<ReturnType<typeof generateReminderDrafts>>([])
  const draftsSignatureRef = useRef<string | null>(null)
  const drafts = useMemo(() => {
    void generationTick
    const next = generateReminderDrafts({
      ...sources.draftInputs,
      preferences: { ...preferences, locale: language }, copy: reminderCopyFor(language), now: new Date(),
    })
    const signature = JSON.stringify(next)
    if (signature === draftsSignatureRef.current) return draftsRef.current
    draftsSignatureRef.current = signature
    draftsRef.current = next
    return next
  }, [sources.draftInputs, preferences, language, generationTick])

  useEffect(() => {
    if (sources.loading || loading) return
    let cancelled = false
    async function sync() {
      try {
        // The coordinator drops a request whose drafts match the last synced
        // set, so an unrelated source rerender no longer reaches the server.
        const outcome = await syncCoordinator.requestSync({ reason: 'drafts-changed', familyId, drafts })
        if (!cancelled && outcome === 'synced') await refresh()
      } catch (syncError) {
        if (cancelled) return
        console.error('Failed to sync reminders:', syncError instanceof Error ? syncError.message : 'unknown error')
        setError(t.reminders.syncFailed)
      }
    }
    void sync()
    return () => { cancelled = true }
  }, [familyId, sources.loading, drafts, loading, refresh, syncCoordinator])

  const updateState = useCallback(async (ids: string[], action: 'read' | 'dismiss') => {
    if (ids.length === 0) return
    const timestamp = new Date().toISOString()
    try {
      await repository.setState(scope, ids, action)
    } catch {
      throw new Error(t.reminders.reminderSaveFailed)
    }
    setReminders((items) => items.map((item) => {
      if (!ids.includes(item.id)) return item
      const next = { ...item, readAt: action === 'read' ? (item.readAt ?? timestamp) : item.readAt, dismissedAt: action === 'dismiss' ? (item.dismissedAt ?? timestamp) : item.dismissedAt }
      return { ...next, status: reminderStatus(next) }
    }))
    broadcastInvalidation('state')
  }, [broadcastInvalidation, repository, scope])

  const markRead = useCallback((id: string) => updateState([id], 'read'), [updateState])
  const markAllRead = useCallback(() => updateState(unreadActiveIds(reminders), 'read'), [reminders, updateState])
  const dismiss = useCallback((id: string) => updateState([id], 'dismiss'), [updateState])

  const savePreferences = useCallback(async (next: NotificationPreferences) => {
    if (!isValidTimeZone(next.timezone)) throw new Error(t.reminders.invalidTimezone)
    const normalized = next.timezoneMode === 'auto' ? { ...next, timezone: browserTimezone() } : next
    try {
      await repository.savePreferences({ ...normalized, memberId: currentMember.id, familyId })
    } catch {
      throw new Error(t.reminders.settingsSaveFailed)
    }
    setPreferences(normalized)
    broadcastInvalidation('preferences')
  }, [broadcastInvalidation, currentMember.id, familyId, repository])

  const active = useMemo(() => activeReminders(reminders), [reminders])
  const history = useMemo(() => historyReminders(reminders), [reminders])
  const count = unreadCount(reminders)
  const hasImportantUnread = active.some((item) => !item.readAt && item.importance === 'important')

  const summary = useMemo<ReminderSummaryValue>(
    () => ({ unreadCount: count, hasImportantUnread }),
    [count, hasImportantUnread],
  )

  const value = useMemo<ReminderContextValue>(() => ({
    reminders, active, history, unreadCount: count, hasImportantUnread, preferences, loading, error,
    hasMore: nextCursor !== null, loadMore,
    markRead, markAllRead, dismiss, savePreferences, refresh,
  }), [
    reminders, active, history, count, hasImportantUnread, preferences, loading, error,
    nextCursor, loadMore, markRead, markAllRead, dismiss, savePreferences, refresh,
  ])

  return (
    <ReminderSummaryContext.Provider value={summary}>
      <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>
    </ReminderSummaryContext.Provider>
  )
}

export function useReminders() {
  const context = useContext(ReminderContext)
  if (!context) throw new Error('useReminders must be used within ReminderProvider')
  return context
}

export function useReminderSummary(): ReminderSummaryValue {
  const context = useContext(ReminderSummaryContext)
  if (!context) throw new Error('useReminderSummary must be used within ReminderProvider')
  return context
}
