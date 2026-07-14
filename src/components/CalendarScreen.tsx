import { useState } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { buildCalendarEntries, deduplicateAgendaRanges, entryMatchesMember, type CalendarEntry } from '../utils/calendarEntries'
import { getChoreState } from '../utils/choreState'
import { addDays, formatFullDate, formatMonthYear, todayISODate } from '../utils/dueDate'
import { getMonthGridRange, shiftMonth } from '../utils/monthGrid'
import { getItemTypeStyle, type CalendarItemType } from '../utils/itemTypeStyle'
import { MonthGrid } from './calendar/MonthGrid'
import { AgendaList } from './calendar/AgendaList'
import { CalendarEntryRow } from './calendar/CalendarEntryRow'
import { Modal } from './ui/Modal'
import { ErrorState } from './ui/ErrorState'
import { UniversalCreateModal } from './planner/UniversalCreateModal'
import { CalendarEntryDetailModal } from './calendar/CalendarEntryDetailModal'

type ViewMode = 'month' | 'agenda'

const ITEM_TYPES: CalendarItemType[] = ['chore', 'activity', 'payment', 'allowance', 'medical', 'vaccination', 'meal']
const AGENDA_PAST_DAYS = 180
const AGENDA_FUTURE_DAYS = 60

export function CalendarScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [monthAnchor, setMonthAnchor] = useState(todayISODate())
  const [filterPerson, setFilterPerson] = useState('')
  const [filterType, setFilterType] = useState<CalendarItemType | ''>('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null)
  const [createConfig, setCreateConfig] = useState<{ initialDate?: string } | null>(null)

  const {
    chores,
    activities,
    medicalRecords,
    planEntries,
    allowancePlans,
    members,
    memberById,
    latestCompletionFor,
    loading,
    error,
    refreshAll,
  } = useFamilyData()
  if (loading) {
    return <p className="loading">{t.loading.generic}</p>
  }

  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />
  }

  const today = todayISODate()
  const range =
    viewMode === 'month'
      ? getMonthGridRange(monthAnchor)
      : { start: addDays(today, -AGENDA_PAST_DAYS), end: addDays(today, AGENDA_FUTURE_DAYS) }

  // Calendar shows what's still relevant: leave out chores already done
  // (non-recurring, approved) and cancelled medical records — everything
  // else is projected as-is from the source records.
  const visibleChores = chores.filter((c) => getChoreState(c, latestCompletionFor(c.id)) !== 'done')
  const visibleMedical = medicalRecords.filter((r) => r.status !== 'cancelled')

  let entries = buildCalendarEntries({
    chores: visibleChores,
    activities,
    medicalRecords: visibleMedical,
    mealPlanEntries: planEntries,
    allowancePlans,
    rangeStart: range.start,
    rangeEnd: range.end,
  })

  if (filterPerson) {
    entries = entries.filter((entry) => entryMatchesMember(entry, filterPerson))
  }
  if (filterType) {
    entries = entries.filter((e) => e.type === filterType)
  }

  const hasFilters = filterPerson !== '' || filterType !== ''
  function clearFilters() {
    setFilterPerson('')
    setFilterType('')
  }

  const dayEntries = selectedDay ? entries.filter((e) => e.date === selectedDay) : []

  return (
    <>
      <div className="screen-header">
        <h1 className="home-title">{t.calendar.title}</h1>
        <div className="header-actions">
          <button
            type="button"
            className="header-icon-button"
            onClick={() => setCreateConfig({})}
            aria-label={t.create.addAction}
          >
            +
          </button>
          <button type="button" className="header-action-button" onClick={() => setMonthAnchor(today)}>
            {t.calendar.today}
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'month'}
          className={`tab-button${viewMode === 'month' ? ' active' : ''}`}
          onClick={() => setViewMode('month')}
        >
          {t.calendar.viewMonth}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'agenda'}
          className={`tab-button${viewMode === 'agenda' ? ' active' : ''}`}
          onClick={() => setViewMode('agenda')}
        >
          {t.calendar.viewAgenda}
        </button>
      </div>

      <div className="filter-row">
        <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} aria-label={t.calendar.filterPersonLabel}>
          <option value="">
            {t.calendar.filterPersonLabel}: {t.calendar.filterAll}
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as CalendarItemType | '')}
          aria-label={t.calendar.filterTypeLabel}
        >
          <option value="">
            {t.calendar.filterTypeLabel}: {t.calendar.filterAll}
          </option>
          {ITEM_TYPES.map((type) => (
            <option key={type} value={type}>
              {getItemTypeStyle(type).label}
            </option>
          ))}
        </select>
      </div>

      {viewMode === 'month' && (
        <>
          <div className="month-nav">
            <button type="button" className="btn-secondary" onClick={() => setMonthAnchor(shiftMonth(monthAnchor, -1))} aria-label="Previous month">
              ‹
            </button>
            <span className="month-nav-label">{formatMonthYear(monthAnchor)}</span>
            <button type="button" className="btn-secondary" onClick={() => setMonthAnchor(shiftMonth(monthAnchor, 1))} aria-label="Next month">
              ›
            </button>
          </div>
          {entries.length === 0 && hasFilters ? (
            <p className="empty-state">{t.calendar.filtersNoResults}</p>
          ) : (
            <MonthGrid monthAnchor={monthAnchor} entries={entries} today={today} onSelectDay={setSelectedDay} />
          )}
        </>
      )}

      {viewMode === 'agenda' && (
        <section className="section">
          {entries.length === 0 && hasFilters ? (
            <p className="empty-state">{t.calendar.filtersNoResults}</p>
          ) : (
            <AgendaList entries={deduplicateAgendaRanges(entries)} today={today} memberById={memberById} onSelectEntry={setSelectedEntry} />
          )}
        </section>
      )}

      {hasFilters && (
        <button type="button" className="link section-footer-link" onClick={clearFilters}>
          {t.calendar.clearFilters}
        </button>
      )}

      {selectedDay && (
        <Modal title={formatFullDate(selectedDay)} onClose={() => setSelectedDay(null)}>
          {dayEntries.length === 0 ? (
            <p className="empty-state">{t.calendar.noEntries}</p>
          ) : (
            <ul className="section-list">
              {dayEntries.map((entry) => (
                <CalendarEntryRow
                  key={entry.id}
                  entry={entry}
                  memberById={memberById}
                  onClick={() => {
                    setSelectedEntry(entry)
                    setSelectedDay(null)
                  }}
                />
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn-secondary modal-primary-action"
            onClick={() => {
              setCreateConfig({ initialDate: selectedDay })
              setSelectedDay(null)
            }}
          >
            <span aria-hidden="true">+</span> {t.create.addThisDayAction}
          </button>
        </Modal>
      )}

      {selectedEntry && (
        <CalendarEntryDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}

      {createConfig && (
        <UniversalCreateModal
          initialDate={createConfig.initialDate}
          onClose={() => setCreateConfig(null)}
        />
      )}
    </>
  )
}
