import { useState } from 'react'
import { useTodayDashboardData } from './today/useTodayDashboardData'
import { useRouter } from '../router'
import { t } from '../strings'
import { getCurrentLanguage } from '../i18n'
import type { CalendarEntry } from '../utils/calendarEntries'
import { formatFullDate, todayISODate } from '../utils/dueDate'
import { buildTodayAttentionItems, buildTodayEntries } from '../utils/todayAgenda'
import { CalendarEntryDetailModal } from './calendar/CalendarEntryDetailModal'
import { PendingApprovals } from './PendingApprovals'
import { UniversalCreateModal } from './planner/UniversalCreateModal'
import { TodayAgendaList } from './today/TodayAgendaList'
import { TodayAttentionList } from './today/TodayAttentionList'
import { TodayProgramEmpty } from './today/TodayProgramEmpty'
import { TodayQuickTodoWidget } from './today/TodayQuickTodoWidget'
import { TodayShoppingWidget } from './today/TodayShoppingWidget'
import { ErrorState } from './ui/ErrorState'
import { getLocalizedAddressName } from '../utils/personalizedName'
import { FamilyMark, type FamilyMarkMember } from './FamilyMark'
import { createQuickShoppingItemInput, createQuickTaskInput, isQuickTodo } from '../utils/todayQuickAdd'
import { getChoreState } from '../utils/choreState'

export function TodayDashboard() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null)
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null)
  const {
    currentMember,
    isParentOrAdmin,
    members,
    kids,
    chores,
    activities,
    medicalRecords,
    planEntries,
    allowancePlans,
    allowanceCycles,
    completions,
    voteRounds,
    pendingCompletions,
    activeShoppingItems,
    familyHeroImageUrl,
    addChore,
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
  const { navigate, navigateHref } = useRouter()

  if (loading) return <p className="loading">{t.loading.generic}</p>
  if (error) return <ErrorState message={error} onRetry={refresh} />

  const today = todayISODate()
  const entries = buildTodayEntries({
    chores,
    activities,
    medicalRecords,
    mealPlanEntries: planEntries,
    allowancePlans,
    latestCompletionFor,
    today,
  })
  const attentionItems = buildTodayAttentionItems({
    chores,
    activities,
    medicalRecords,
    voteRounds,
    allowancePlans,
    allowanceCycles,
    completions,
    currentMemberId: currentMember.id,
    latestCompletionFor,
    today,
  })
  const needsAttention = pendingCompletions.length > 0 || attentionItems.length > 0
  const quickTodos = chores.filter((chore) => isQuickTodo(chore) && getChoreState(chore, latestCompletionFor(chore.id)) === 'actionable')
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

  return (
    <>
      <TodayHeader
        name={addressName || null}
        date={today}
        itemCount={entries.length}
        members={members}
        familyHeroImageUrl={familyHeroImageUrl}
        onAdd={() => setShowCreate(true)}
      />

      {approvalFeedback && <p className="success approval-feedback" role="status">{approvalFeedback}</p>}

      {isParentOrAdmin && <TodayQuickTodoWidget
        tasks={quickTodos}
        onAdd={(title) => addChore(createQuickTaskInput(title))}
        onComplete={(taskId) => markDone(taskId)}
        onPromote={(taskId) => navigateHref(`/chores?chore=${taskId}&edit=1`)}
        onOpenAll={() => navigate('/chores')}
      />}

      {needsAttention && (
        <section className="section today-attention-section">
          <h2>{t.today.attentionTitle}</h2>
          {pendingCompletions.length > 0 && (
            <div className="today-attention-group">
              <h3 className="today-section-subheading">{t.today.approvalsTitle}</h3>
              <PendingApprovals
                completions={pendingCompletions}
                chores={chores}
                memberById={memberById}
                onApprove={handleApprove}
                onReject={reject}
              />
            </div>
          )}
          {attentionItems.length > 0 && (
            <div className="today-attention-group">
              {pendingCompletions.length > 0 && (
                <h3 className="today-section-subheading">{t.today.otherAttentionTitle}</h3>
              )}
              <TodayAttentionList items={attentionItems} memberById={memberById} />
            </div>
          )}
        </section>
      )}

      <section className="section today-program-section">
        <h2>{t.today.programTitle}</h2>
        {entries.length === 0 ? (
          <TodayProgramEmpty onAdd={() => setShowCreate(true)} />
        ) : (
          <TodayAgendaList entries={entries} memberById={memberById} onSelectEntry={setSelectedEntry} />
        )}
      </section>

      <TodayShoppingWidget
        items={activeShoppingItems}
        onOpen={() => navigate('/shopping')}
        onAddItem={(name) => addShoppingItem(createQuickShoppingItemInput(name))}
      />

      {kids.length === 0 && (
        <section className="section today-setup-card">
          <h2>{t.today.optionalSetupTitle}</h2>
          <p>{t.today.optionalSetupBody}</p>
          <button type="button" className="btn-secondary" onClick={() => navigate('/family')}>
            {t.today.setupAddChildAction}
          </button>
        </section>
      )}

      {selectedEntry && (
        <CalendarEntryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}

      {showCreate && (
        <UniversalCreateModal initialDate={today} onClose={() => setShowCreate(false)} />
      )}
    </>
  )
}

interface HeaderProps {
  name: string | null
  date: string
  itemCount: number
  members: FamilyMarkMember[]
  familyHeroImageUrl: string | null
  onAdd: () => void
}

function TodayHeader({ name, date, itemCount, members, familyHeroImageUrl, onAdd }: HeaderProps) {
  return (
    <div className={`today-hero${familyHeroImageUrl ? ' has-family-photo' : ''}`}>
      {familyHeroImageUrl && <img className="today-hero-photo" src={familyHeroImageUrl} alt="" aria-hidden="true" />}
      {!familyHeroImageUrl && <FamilyMark variant="dynamic" members={members} size={96} className="today-family-mark" />}
      <div className="today-hero-copy">
        <span className="page-eyebrow">{t.home.title}</span>
        <h1 className="home-title">{t.home.welcome(name)}</h1>
        <p className="today-date">{formatFullDate(date)}</p>
        <p className="today-summary">{t.today.itemsSummary(itemCount)}</p>
      </div>
      <button type="button" className="hero-action-button" onClick={onAdd}>
        <span aria-hidden="true">+</span> {t.create.addAction}
      </button>
    </div>
  )
}
