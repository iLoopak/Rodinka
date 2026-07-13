import { useState } from 'react'
import { t } from '../../strings'
import { useFamilyData } from '../../context/FamilyDataContext'
import { formatShortDate, todayISODate } from '../../utils/dueDate'
import { getCurrentWeekStart, getWeekDates, isCurrentWeek, shiftWeek, formatWeekRangeLabel } from '../../utils/mealWeek'
import { displayTitle, groupEntriesByDate } from '../../utils/mealPlanGrouping'
import { mealPlanStatusLabel, mealSlotLabel } from '../../utils/mealLabels'
import { onActivateKey } from '../../utils/a11y'
import { EmptyState } from '../ui/EmptyState'
import { Modal } from '../ui/Modal'
import { MemberAvatar } from '../ui/MemberAvatar'
import { AddPlanEntryForm } from './AddPlanEntryForm'
import type { MealPlanEntry, MealSlot } from '../../hooks/useMealPlanEntries'
import type { PlanEntryInput } from '../../context/useMealsData'

const PRIMARY_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner']
const WEEKDAY_LABELS = [
  t.calendar.weekdayShortMon,
  t.calendar.weekdayShortTue,
  t.calendar.weekdayShortWed,
  t.calendar.weekdayShortThu,
  t.calendar.weekdayShortFri,
  t.calendar.weekdayShortSat,
  t.calendar.weekdayShortSun,
]

interface PendingAdd {
  date: string
  slot: MealSlot
}

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
  const { meals, members, planEntries, memberName, isParentOrAdmin, addPlanEntry, updatePlanEntry, deletePlanEntry, copyWeek } =
    useFamilyData()
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart())
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(prefill ? { date: todayISODate(), slot: 'dinner' } : null)
  const [editingEntry, setEditingEntry] = useState<MealPlanEntry | null>(null)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dates = getWeekDates(weekStart)
  const grouped = groupEntriesByDate(planEntries, dates)
  const today = todayISODate()
  const totalThisWeek = dates.reduce((sum, date) => sum + (grouped.get(date)?.length ?? 0), 0)

  function closeAddSheet() {
    setPendingAdd(null)
    onPrefillConsumed?.()
  }

  async function handleAdd(input: PlanEntryInput) {
    await addPlanEntry(input)
    closeAddSheet()
  }

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
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCopying(false)
    }
  }

  return (
    <>
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
        {isParentOrAdmin && (
          <button
            type="button"
            className="header-action-button"
            onClick={() => setPendingAdd({ date: today >= weekStart && today <= dates[6] ? today : weekStart, slot: 'dinner' })}
          >
            <span aria-hidden="true">+</span> {t.mealPlan.addEntryAction}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {totalThisWeek === 0 ? (
        <EmptyState
          title={t.mealPlan.noMealsPlannedThisWeek}
          action={isParentOrAdmin ? { label: t.mealPlan.addEntryAction, onClick: () => setPendingAdd({ date: today, slot: 'dinner' }) } : undefined}
        />
      ) : (
        <div className="week-planner">
          {dates.map((date, index) => {
            const entries = grouped.get(date) ?? []
            const slotsWithEntries = new Set(entries.map((entry) => entry.meal_slot))
            const missingPrimarySlots = PRIMARY_SLOTS.filter((slot) => !slotsWithEntries.has(slot))

            return (
              <div key={date} className={`day-plan-card${date === today ? ' today' : ''}`}>
                <div className="day-plan-header">
                  <span className="day-plan-weekday">{WEEKDAY_LABELS[index]}</span>
                  <span className="day-plan-date">{formatShortDate(date)}</span>
                </div>
                <ul className="section-list">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="clickable-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingEntry(entry)}
                      onKeyDown={onActivateKey(() => setEditingEntry(entry))}
                    >
                      <span className="row-meta">{mealSlotLabel(entry.meal_slot)}</span>
                      <span className="row-title">{displayTitle(entry, '—')}</span>
                      {entry.responsible_member_id && (
                        <MemberAvatar
                          member={{ id: entry.responsible_member_id, display_name: memberName(entry.responsible_member_id) }}
                          size={22}
                        />
                      )}
                      <span className="row-spacer" />
                      <span className={`badge ${statusBadgeClass(entry.status)}`}>{mealPlanStatusLabel(entry.status)}</span>
                    </li>
                  ))}
                  {isParentOrAdmin &&
                    missingPrimarySlots.map((slot) => (
                      <li
                        key={slot}
                        className="clickable-row empty-slot-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => setPendingAdd({ date, slot })}
                        onKeyDown={onActivateKey(() => setPendingAdd({ date, slot }))}
                      >
                        <span className="row-meta">{mealSlotLabel(slot)}</span>
                        <span className="row-title empty-slot-label">{t.mealPlan.emptySlot}</span>
                        <span className="row-spacer" />
                        <span aria-hidden="true">+</span>
                      </li>
                    ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {pendingAdd && (
        <Modal title={t.mealPlan.addEntryTitle} onClose={closeAddSheet}>
          <AddPlanEntryForm
            meals={meals}
            members={members}
            planEntries={planEntries}
            defaultDate={pendingAdd.date}
            defaultSlot={pendingAdd.slot}
            prefill={prefill}
            onSubmit={handleAdd}
          />
        </Modal>
      )}

      {editingEntry && (
        <Modal title={t.mealPlan.editEntryTitle} onClose={() => setEditingEntry(null)}>
          <AddPlanEntryForm meals={meals} members={members} planEntries={planEntries} initial={editingEntry} onSubmit={handleUpdate} />
          <button type="button" className="btn-secondary" onClick={handleRemove}>
            {t.mealPlan.removeEntryAction}
          </button>
        </Modal>
      )}
    </>
  )
}
