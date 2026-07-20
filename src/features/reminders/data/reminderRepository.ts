import type { NotificationPreferences, ReminderRecord } from '../../../notifications/reminders'
import type { ReminderSummaryRow } from '../domain/reminderMappers'

export interface ReminderScope {
  familyId: string
  memberId: string
}

export interface ReminderPageQuery {
  scope: ReminderScope
  limit: number
  /** `generated_at` of the last item on the previous page. */
  before?: string | null
}

export interface ReminderPage {
  items: ReminderRecord[]
  /** Pass back as `before` to fetch the next page; null when exhausted. */
  nextCursor: string | null
}

export interface ReminderSummary {
  unreadCount: number
  hasImportantUnread: boolean
}

export type ReminderStateAction = 'read' | 'dismiss'

export interface ReminderRepository {
  /**
   * Reads only the columns needed to count unread and spot an important one.
   * The bell previously derived both from the full list, which meant loading
   * every reminder's title, description and metadata to render two numbers.
   */
  getSummary(scope: ReminderScope): Promise<ReminderSummary>
  listPage(query: ReminderPageQuery): Promise<ReminderPage>
  setState(scope: ReminderScope, ids: string[], action: ReminderStateAction): Promise<void>
  loadPreferences(scope: ReminderScope): Promise<NotificationPreferences>
  /** Creates the row on first use, then normalises drifted timezone/mode. */
  ensurePreferences(preferences: NotificationPreferences, existing: NotificationPreferences | null): Promise<void>
  savePreferences(preferences: NotificationPreferences): Promise<void>
  updateLocale(scope: ReminderScope, locale: NotificationPreferences['locale']): Promise<void>
}

export interface ReminderSyncInput {
  familyId: string
  drafts: unknown[]
}

/**
 * Server-side generation is its own boundary, not a repository method: it does
 * not read or write a reminder aggregate, it hands the server a set of drafts
 * and lets it reconcile. Keeping it separate is also what stops "sync" from
 * being called as if it were a cheap refresh.
 */
export interface ReminderProcessingService {
  synchronizeSources(input: ReminderSyncInput): Promise<void>
}

/**
 * Mirrors `activeReminders` + `unreadCount` from reminderPresentation: active
 * means neither resolved nor dismissed. A test pins the two against each other
 * so the bell and the Center cannot drift apart.
 */
export function summaryFromRows(rows: ReminderSummaryRow[]): ReminderSummary {
  const unread = rows.filter((row) => !row.resolvedAt && !row.dismissedAt && !row.readAt)
  return {
    unreadCount: unread.length,
    hasImportantUnread: unread.some((row) => row.importance === 'important'),
  }
}
