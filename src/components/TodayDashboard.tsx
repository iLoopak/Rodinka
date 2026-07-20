import { useState } from 'react'
import { useTodayDashboardData } from './today/useTodayDashboardData'
import { useRouteSearchParams, useRouterActions } from '../router'
import { t } from '../strings'
import { useConnectivityState } from '../network/connectivity'
import { getCurrentLanguage } from '../i18n'
import type { CalendarEntry } from '../utils/calendarEntries'
import { formatFullDate, todayISODate } from '../utils/dueDate'
import { buildTodayAttentionItems, buildTodayEntries, isChildTodayAttentionVisible, isChildTodayEntryVisible } from '../utils/todayAgenda'
import { CalendarEntryDetailModal } from './calendar/CalendarEntryDetailModal'
import { PendingApprovals } from './PendingApprovals'
import { TodayAgendaList } from './today/TodayAgendaList'
import { TodayAttentionList } from './today/TodayAttentionList'
import { TodayProgramEmpty } from './today/TodayProgramEmpty'
import { TodayQuickTodoWidget } from './today/TodayQuickTodoWidget'
import { TodayShoppingWidget } from './today/TodayShoppingWidget'
import { ErrorState } from './ui/ErrorState'
import { getLocalizedAddressName } from '../utils/personalizedName'
import { createQuickShoppingItemInput, createQuickTaskInput, isQuickTodo } from '../utils/todayQuickAdd'
import { getChoreState } from '../utils/choreState'
import { ChoreDetailModal } from './ChoreDetailModal'
import { closeTodayChoreEditor, openTodayChoreEditor } from './today/todayChoreEditor'
import { capabilitiesFor } from '../utils/uiCapabilities'
import { useCreateRecord } from '../context/create-record/CreateRecordContext'

export function TodayDashboard() {
  const { openCreateRecord } = useCreateRecord()
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null)
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null)
  const {
    currentMember,
    isParentOrAdmin,
    members,
    kids,
    chores,
    activities,
    occurrenceOverrides,
    assignmentHistory,
    participantHistory,
    medicalRecords,
    planEntries,
    allowancePlans,
    allowanceCycles,
    completions,
    voteRounds,
    pendingCompletions,
    activeShoppingItems,
    shoppingLoading,
    shoppingHasUsableData,
    shoppingSyncStatus,
    shoppingLastSyncedAt,
    pendingShoppingChanges,
    calendarSyncStatus,
    calendarLastSyncedAt,
    pendingCalendarChanges,
    hasOfflineCalendarSnapshot,
    usingOfflineCalendarSnapshot,
    familyHeroImageUrl,
    addChore,
    updateChore,
    setChoreArchived,
    addShoppingItem,
    memberById,
    latestCompletionFor,
    markDone,
    approve,
    reject,
    loading,
    error,
    refresh,
  } = useTodayDashboardData()
  const searchParams = useRouteSearchParams()
  const { navigate, setQueryParam, removeQueryParam } = useRouterActions()
  const capabilities = capabilitiesFor(currentMember)

  if (loading) return <p className="loading">{t.loading.generic}</p>
  if (error) return <ErrorState message={error} onRetry={refresh} />

  const today = todayISODate()
  const entries = buildTodayEntries({
    chores,
    activities,
    medicalRecords: capabilities.isChild ? [] : medicalRecords,
    mealPlanEntries: planEntries,
    allowancePlans: capabilities.isChild ? [] : allowancePlans,
    occurrenceOverrides,
    assignmentHistory,
    participantHistory,
    latestCompletionFor,
    today,
  }).filter((entry) => !capabilities.isChild || isChildTodayEntryVisible(entry, currentMember.id))
  const attentionItems = buildTodayAttentionItems({
    chores,
    activities,
    medicalRecords,
    voteRounds,
    allowancePlans,
    allowanceCycles,
    completions,
    currentMemberId: currentMember.id,
    occurrenceOverrides,
    assignmentHistory,
    latestCompletionFor,
    today,
  }).filter((item) => !capabilities.isChild || isChildTodayAttentionVisible(item, currentMember.id))
  const visiblePendingCompletions = capabilities.approveTaskCompletions ? pendingCompletions : []
  const needsAttention = visiblePendingCompletions.length > 0 || attentionItems.length > 0
  const quickTodos = chores.filter((chore) => isQuickTodo(chore) && getChoreState(chore, latestCompletionFor(chore.id)) === 'actionable')
  const choreParam = searchParams.get('chore')
  const editParam = searchParams.get('edit') === '1'
  const selectedChore = choreParam ? chores.find((chore) => chore.id === choreParam) ?? null : null
  const addressName = getLocalizedAddressName({
    firstName: currentMember.display_name,
    manualVocative: currentMember.vocative_name,
    locale: getCurrentLanguage(),
  })

  async function handleApprove(completionId: string) {
    const result = await approve(completionId)
    setApprovalFeedback(result.nextDueDate
      ? t.chores.approvedNextDue(formatFullDate(result.nextDueDate))
      : t.chores.approvedOneOff)
    return result
  }

  function openQuickTaskEditor(taskId: string) {
    openTodayChoreEditor(taskId, setQueryParam)
  }

  function closeQuickTaskEditor() {
    closeTodayChoreEditor(removeQueryParam)
  }

  return (
    <>
      <div className="today-dashboard">
      <TodayOfflineStatus
        calendarSyncStatus={calendarSyncStatus}
        shoppingSyncStatus={shoppingSyncStatus}
        calendarLastSyncedAt={calendarLastSyncedAt}
        shoppingLastSyncedAt={shoppingLastSyncedAt}
        pendingChanges={pendingCalendarChanges + pendingShoppingChanges}
      />

      <TodayHeader
        name={addressName || null}
        date={today}
        itemCount={entries.length}
        familyHeroImageUrl={familyHeroImageUrl}
        onAdd={capabilities.createPlannerItems ? () => openCreateRecord({ date: today, source: 'today' }) : undefined}
      />

      {approvalFeedback && <p className="success approval-feedback" role="status">{approvalFeedback}</p>}

      {needsAttention && (
        <section className="page-section today-attention-section">
          <h2 className="section-heading">{t.today.attentionTitle}</h2>
          <div className="panel is-attention">
            {visiblePendingCompletions.length > 0 && (
              <div className="today-attention-group">
                <h3 className="page-section-subheading">{t.today.approvalsTitle}</h3>
                <PendingApprovals
                  completions={visiblePendingCompletions}
                  chores={chores}
                  memberById={memberById}
                  onApprove={handleApprove}
                  onReject={reject}
                />
              </div>
            )}
            {attentionItems.length > 0 && (
              <div className="today-attention-group">
                {visiblePendingCompletions.length > 0 && (
                  <h3 className="page-section-subheading">{t.today.otherAttentionTitle}</h3>
                )}
                <TodayAttentionList items={attentionItems} memberById={memberById} />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="page-section today-program-section">
        <h2 className="section-heading">{t.today.programTitle}</h2>
        {entries.length === 0 ? (
          <div className="panel is-quiet">
            <TodayProgramEmpty onAdd={capabilities.createPlannerItems ? () => openCreateRecord({ date: today, source: 'today-empty' }) : undefined} />
          </div>
        ) : (
          <div className="panel is-primary">
            <TodayAgendaList entries={entries} memberById={memberById} onSelectEntry={setSelectedEntry} />
          </div>
        )}
      </section>

      {isParentOrAdmin && (hasOfflineCalendarSnapshot || !usingOfflineCalendarSnapshot) && <TodayQuickTodoWidget
        tasks={quickTodos}
        onAdd={(title) => addChore(createQuickTaskInput(title))}
        onComplete={(taskId) => markDone(taskId)}
        onPromote={openQuickTaskEditor}
        onOpenAll={() => navigate('/chores')}
      />}

      <TodayShoppingWidget
        items={activeShoppingItems}
        loading={shoppingLoading}
        hasUsableData={shoppingHasUsableData}
        syncStatus={shoppingSyncStatus}
        onOpen={() => navigate('/shopping')}
        onAddItem={(name) => addShoppingItem(createQuickShoppingItemInput(name))}
      />

      {!capabilities.isChild && kids.length === 0 && (
        <section className="page-section today-setup-card">
          <div className="panel is-quiet">
            <h2 className="today-setup-title">{t.today.optionalSetupTitle}</h2>
            <p>{t.today.optionalSetupBody}</p>
            <button type="button" className="btn-secondary" onClick={() => navigate('/family')}>
              {t.today.setupAddChildAction}
            </button>
          </div>
        </section>
      )}
      </div>

      {selectedEntry && (
        <CalendarEntryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}

      {selectedChore && editParam && isParentOrAdmin && <ChoreDetailModal
        key={`today:${selectedChore.id}:edit`}
        chore={selectedChore}
        assignee={selectedChore.assigned_to ? memberById(selectedChore.assigned_to) : undefined}
        members={members}
        currentMemberId={currentMember.id}
        completions={completions.filter((completion) => completion.chore_id === selectedChore.id)}
        latestCompletion={latestCompletionFor(selectedChore.id)}
        canManage={isParentOrAdmin}
        initialEditing
        closeAfterSave
        onMarkDone={markDone}
        onUpdate={updateChore}
        onSetArchived={setChoreArchived}
        onClose={closeQuickTaskEditor}
      />}
    </>
  )
}

interface HeaderProps {
  name: string | null
  date: string
  itemCount: number
  familyHeroImageUrl: string | null
  onAdd?: () => void
}

type TodaySyncStatus = 'offline' | 'syncing' | 'synced' | 'error'

interface TodayOfflineStatusProps {
  calendarSyncStatus: TodaySyncStatus
  shoppingSyncStatus: TodaySyncStatus
  calendarLastSyncedAt: string | null
  shoppingLastSyncedAt: string | null
  pendingChanges: number
}

function TodayOfflineStatus({ calendarSyncStatus, shoppingSyncStatus, calendarLastSyncedAt, shoppingLastSyncedAt, pendingChanges }: TodayOfflineStatusProps) {
  // Feature sync state stays feature-level here on purpose — this badge is
  // about the calendar and shopping queues. Only the device-level half comes
  // from the shared snapshot, so it actually re-renders when the radio flips.
  const connectivity = useConnectivityState()
  const offline = calendarSyncStatus === 'offline' || shoppingSyncStatus === 'offline' || connectivity === 'offline'
  const syncing = calendarSyncStatus === 'syncing' || shoppingSyncStatus === 'syncing'
  if (!offline && !syncing) return null
  const lastSyncedAt = [calendarLastSyncedAt, shoppingLastSyncedAt].filter(Boolean).sort().at(-1) ?? null
  const lastSynced = lastSyncedAt ? new Date(lastSyncedAt) : null
  const label = syncing ? t.today.syncing(pendingChanges) : offline ? t.today.offlineMode : ''
  return <div className={`today-offline-status${syncing ? ' is-syncing' : ' is-offline'}`} role="status">
    <span className="shopping-sync-status-dot" aria-hidden="true" />
    <span>{label}</span>
    {lastSynced && <span>{t.today.lastUpdated(formatFullDate(lastSynced.toISOString().slice(0, 10)))}</span>}
  </div>
}

function TodayHeader({ name, date, itemCount, familyHeroImageUrl, onAdd }: HeaderProps) {
  return (
    <div className={`today-hero${familyHeroImageUrl ? ' has-family-photo' : ''}`}>
      {familyHeroImageUrl && <img className="today-hero-photo" src={familyHeroImageUrl} alt="" aria-hidden="true" />}
      <div className="today-hero-copy">
        {/* Over a photo the eyebrow is both redundant and unreadable: it sits at
            the top of the copy, where a scrim anchored to the bottom is weakest. */}
        {!familyHeroImageUrl && <span className="page-eyebrow">{t.home.title}</span>}
        <h1 className="home-title">{t.home.welcome(name)}</h1>
        <p className="today-date">{formatFullDate(date)}</p>
        <p className="today-summary">{t.today.itemsSummary(itemCount)}</p>
      </div>
      {onAdd && <button type="button" className="hero-action-button" onClick={onAdd}>
        <span aria-hidden="true">+</span> {t.create.addAction}
      </button>}
    </div>
  )
}
