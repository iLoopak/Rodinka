import { useEffect, useState } from 'react'
import { t } from '../../strings'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useMealsDataContext } from '../../context/meals/MealsContext'
import { formatShortDate, todayISODate } from '../../utils/dueDate'
import { getCurrentWeekStart, getWeekStart, getWeekDates, isCurrentWeek, shiftWeek, formatWeekRangeLabel } from '../../utils/mealWeek'
import { displayTitle, groupEntriesByDate } from '../../utils/mealPlanGrouping'
import { mealPlanStatusLabel, mealSlotLabel } from '../../utils/mealLabels'
import { onActivateKey } from '../../utils/a11y'
import { Modal } from '../ui/Modal'
import { MemberAvatar } from '../ui/MemberAvatar'
import { AddPlanEntryForm } from './AddPlanEntryForm'
import type { MealPlanEntry } from '../../features/meals/domain/mealTypes'
import type { PlanEntryInput } from '../../context/meals/MealsContext'
import { MealIngredientsSection } from './MealIngredientsSection'
import { useCreateRecord } from '../../context/create-record/CreateRecordContext'

function weekdayLabels() { return [
  t.calendar.weekdayShortMon,
  t.calendar.weekdayShortTue,
  t.calendar.weekdayShortWed,
  t.calendar.weekdayShortThu,
  t.calendar.weekdayShortFri,
  t.calendar.weekdayShortSat,
  t.calendar.weekdayShortSun,
] }

export interface PlanPrefill {
  mealId: string | null
  title: string
}

interface Props {
  prefill?: PlanPrefill
  onPrefillConsumed?: () => void
}

function statusBadgeClass(status: MealPlanEntry['status']): string {
  if (status === 'confirmed' || status === 'completed') return 'badge-done'
  if (status === 'skipped') return 'badge-overdue'
  return 'badge-pending'
}

export function PlanTab({ prefill, onPrefillConsumed }: Props) {
  const { isParentOrAdmin } = useFamilyCore()
  const { members, memberById } = useFamilyMembersData()
  const { meals, planEntries, updatePlanEntry, deletePlanEntry, copyWeek } = useMealsDataContext()
  const { openCreateRecord } = useCreateRecord()
  const [weekStart, setWeekStart] = useState(() => {
    const date = new URLSearchParams(window.location.search).get('date')
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? getWeekStart(date) : getCurrentWeekStart()
  })
  const [editingEntry, setEditingEntry] = useState<MealPlanEntry | null>(null)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dates = getWeekDates(weekStart)
  const grouped = groupEntriesByDate(planEntries, dates)
  const today = todayISODate()

  useEffect(() => {
    if (!prefill) return
    openCreateRecord({
      type: 'meal',
      date: todayISODate(),
      section: 'dinner',
      source: 'meal-library',
      mealId: prefill.mealId ?? undefined,
      initialTitle: prefill.title,
    })
    onPrefillConsumed?.()
  }, [openCreateRecord, onPrefillConsumed, prefill])

  async function handleUpdate(input: PlanEntryInput) {
    if (!editingEntry) return
    await updatePlanEntry(editingEntry.id, input)
    setEditingEntry(null)
  }

  async function handleRemove() {
    if (!editingEntry) return
    await deletePlanEntry(editingEntry.id)
    setEditingEntry(null)
  }

  async function handleCopyPreviousWeek() {
    setCopying(true)
    setError(null)
    try {
      await copyWeek(shiftWeek(weekStart, -1), weekStart)
    } catch (err) {
      console.error('Failed to update meal plan:', err)
      setError(t.errors.generic)
    } finally {
      setCopying(false)
    }
  }

  return (
    <>
      {/* Week navigation is deliberately compact and secondary — the day
          list below is what the eye should land on first. */}
      <div className="month-nav">
        <button type="button" className="btn-secondary" onClick={() => setWeekStart(shiftWeek(weekStart, -1))} aria-label={t.mealPlan.previousWeekAction}>
          ‹
        </button>
        <span className="month-nav-label">{formatWeekRangeLabel(weekStart)}</span>
        <button type="button" className="btn-secondary" onClick={() => setWeekStart(shiftWeek(weekStart, 1))} aria-label={t.mealPlan.nextWeekAction}>
          ›
        </button>
      </div>

      <div className="tab-toolbar">
        {isParentOrAdmin && (
          <button type="button" className="header-action-button" onClick={() => openCreateRecord({ type: 'meal', date: today, section: 'dinner', source: 'meal-plan' })}>
            <span aria-hidden="true">+</span> {t.mealPlan.addEntryAction}
          </button>
        )}
        {!isCurrentWeek(weekStart) && (
          <button type="button" className="btn-secondary" onClick={() => setWeekStart(getCurrentWeekStart())}>
            {t.mealPlan.thisWeekAction}
          </button>
        )}
        {isParentOrAdmin && (
          <button type="button" className="btn-secondary" onClick={handleCopyPreviousWeek} disabled={copying}>
            {copying ? t.mealPlan.copyingWeek : t.mealPlan.copyPreviousWeekAction}
          </button>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="week-planner">
        {dates.map((date, index) => {
          const entries = grouped.get(date) ?? []
          const showSlotBadge = entries.length > 1

          return (
            <div key={date} className={`day-plan-card${date === today ? ' today' : ''}`}>
              <div className="day-plan-header">
                <span className="day-plan-weekday">{weekdayLabels()[index]}</span>
                <span className="day-plan-date">{formatShortDate(date)}</span>
                {date === today && <span className="today-badge">{t.calendar.todayBadge}</span>}
              </div>

              {entries.length === 0 ? (
                <div className="day-plan-empty">
                  <p className="empty-state">{t.mealPlan.dayEmpty}</p>
                  {isParentOrAdmin && (
                    <button type="button" className="btn-secondary" onClick={() => openCreateRecord({ type: 'meal', date, section: 'dinner', source: 'meal-plan-day' })}>
                      {t.mealPlan.addEntryAction}
                    </button>
                  )}
                </div>
              ) : (
                <ul className="day-plan-meals">
                  {entries.map((entry) => {
                    const responsible = entry.responsible_member_id
                      ? memberById(entry.responsible_member_id)
                      : undefined
                    return (
                      <li
                        key={entry.id}
                        className="day-plan-meal clickable-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => setEditingEntry(entry)}
                        onKeyDown={onActivateKey(() => setEditingEntry(entry))}
                      >
                        {showSlotBadge && <span className="day-plan-meal-slot">{mealSlotLabel(entry.meal_slot)}</span>}
                        <span className="day-plan-meal-title">{displayTitle(entry, '—')}</span>
                        <div className="day-plan-meal-meta">
                          {entry.responsible_member_id && (
                            <span className="day-plan-meal-responsible">
                              <MemberAvatar member={responsible} size={20} />
                              {t.memberGrammar.preparedBy(
                                responsible?.display_name ?? '?',
                                responsible?.grammatical_gender ?? null
                              )}
                            </span>
                          )}
                          <span className={`badge ${statusBadgeClass(entry.status)}`}>
                            {mealPlanStatusLabel(entry.status)}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                  {isParentOrAdmin && (
                    <li>
                      <button
                        type="button"
                        className="link day-plan-add-more"
                        onClick={() => openCreateRecord({ type: 'meal', date, section: 'dinner', source: 'meal-plan-day' })}
                      >
                        {t.mealPlan.addAnotherMealAction}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {editingEntry && (
        <Modal title={t.mealPlan.editEntryTitle} onClose={() => setEditingEntry(null)}>
          <AddPlanEntryForm meals={meals} members={members} planEntries={planEntries} initial={editingEntry} onSubmit={handleUpdate} />
          {editingEntry.meal_id && <MealIngredientsSection mealId={editingEntry.meal_id} sourcePlanEntryId={editingEntry.id} allowEdit={false} />}
          <button type="button" className="btn-secondary" onClick={handleRemove}>
            {t.mealPlan.removeEntryAction}
          </button>
        </Modal>
      )}
    </>
  )
}
