import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ErrorState } from './ui/ErrorState'
import { UniversalCreateModal } from './planner/UniversalCreateModal'
import { CalendarEntryDetailModal } from './calendar/CalendarEntryDetailModal'
import { WeekAgenda } from './calendar/WeekAgenda'
import { useRouter } from '../router'
import { isValidISODate, isValidUuid } from '../utils/deepLinks'
import { getWeekDates, getWeekStart } from '../utils/weekCalendar'

type ViewMode = 'month' | 'week' | 'agenda'

const ITEM_TYPES: CalendarItemType[] = ['chore', 'activity', 'payment', 'allowance', 'medical', 'vaccination', 'meal']
const AGENDA_PAST_DAYS = 180
const AGENDA_FUTURE_DAYS = 60
const CALENDAR_VIEW_KEY = 'rodinka:calendar:view'

function storedCalendarView(): ViewMode {
  try {
    const stored = localStorage.getItem(CALENDAR_VIEW_KEY)
    return stored === 'week' || stored === 'agenda' || stored === 'month' ? stored : 'month'
  } catch { return 'month' }
}

export function CalendarScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>(storedCalendarView)
  const [monthAnchor, setMonthAnchor] = useState(todayISODate())
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayISODate()))
  const [selectedWeekDay, setSelectedWeekDay] = useState(todayISODate())
  const [weekScrollVersion, setWeekScrollVersion] = useState(0)
  const [filterPerson, setFilterPerson] = useState('')
  const [filterType, setFilterType] = useState<CalendarItemType | ''>('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null)
  const [createConfig, setCreateConfig] = useState<{ initialDate?: string } | null>(null)
  const [deepLinkError, setDeepLinkError] = useState(false)
  const { searchParams, setQueryParam, removeQueryParam } = useRouter()
  const dateParam = searchParams.get('date')
  const eventParam = searchParams.get('event')
  const processedDeepLinkRef = useRef<string | null>(null)

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

  useEffect(() => {
    try { localStorage.setItem(CALENDAR_VIEW_KEY, viewMode) } catch { /* Private browsing can deny storage. */ }
  }, [viewMode])

  useEffect(() => {
    if (loading || error) return
    const deepLinkKey = `${dateParam ?? ''}|${eventParam ?? ''}`
    if (processedDeepLinkRef.current === deepLinkKey) return
    processedDeepLinkRef.current = deepLinkKey
    let invalid = false

    if (dateParam !== null) {
      if (isValidISODate(dateParam)) {
        setViewMode('month')
        setMonthAnchor(dateParam)
        setSelectedDay(dateParam)
      } else {
        invalid = true
        setSelectedDay(null)
      }
    } else {
      setSelectedDay(null)
    }

    if (eventParam !== null) {
      if (!isValidUuid(eventParam)) {
        invalid = true
        setSelectedEntry(null)
      } else {
        const sourceActivity = activities.find((item) => item.id === eventParam)
        const sourceDate =
          chores.find((item) => item.id === eventParam)?.due_date ??
          (sourceActivity
            ? sourceActivity.recurrence_type === 'one_off' ? sourceActivity.start_date : todayISODate()
            : null) ??
          medicalRecords.find((item) => item.id === eventParam)?.record_date ??
          planEntries.find((item) => item.id === eventParam)?.entry_date ??
          allowancePlans.find((item) => item.id === eventParam)?.starts_on ??
          null

        const entry = sourceDate
          ? buildCalendarEntries({
              chores,
              activities,
              medicalRecords,
              mealPlanEntries: planEntries,
              allowancePlans,
              rangeStart: sourceDate,
              rangeEnd: addDays(sourceDate, 31),
            }).find((candidate) => candidate.sourceId === eventParam)
          : undefined

        if (entry) {
          setViewMode('month')
          setMonthAnchor(entry.date)
          setSelectedDay(null)
          setSelectedEntry(entry)
        } else {
          invalid = true
          setSelectedEntry(null)
        }
      }
    } else {
      setSelectedEntry(null)
    }

    setDeepLinkError(invalid)
  }, [activities, allowancePlans, chores, dateParam, error, eventParam, loading, medicalRecords, planEntries])

  const today = todayISODate()
  const range =
    viewMode === 'month'
      ? getMonthGridRange(monthAnchor)
      : viewMode === 'week'
        ? { start: weekStart, end: addDays(weekStart, 6) }
      : { start: addDays(today, -AGENDA_PAST_DAYS), end: addDays(today, AGENDA_FUTURE_DAYS) }

  // Calendar shows what's still relevant: leave out chores already done
  // (non-recurring, approved) and cancelled medical records — everything
  // else is projected as-is from the source records.
  const entries = useMemo(() => {
    const visibleChores = chores.filter((chore) => {
      const state = getChoreState(chore, latestCompletionFor(chore.id))
      return state !== 'done' && state !== 'archived'
    })
    const visibleMedical = medicalRecords.filter((record) => record.status !== 'cancelled')
    let projected = buildCalendarEntries({
      chores: visibleChores, activities, medicalRecords: visibleMedical, mealPlanEntries: planEntries,
      allowancePlans, rangeStart: range.start, rangeEnd: range.end,
    })
    if (filterPerson) projected = projected.filter((entry) => entryMatchesMember(entry, filterPerson))
    if (filterType) projected = projected.filter((entry) => entry.type === filterType)
    return projected
  }, [activities, allowancePlans, chores, filterPerson, filterType, latestCompletionFor, medicalRecords, planEntries, range.end, range.start])

  if (loading) return <p className="loading">{t.loading.generic}</p>
  if (error) return <ErrorState message={error} onRetry={refreshAll} />

  const hasFilters = filterPerson !== '' || filterType !== ''
  function clearFilters() {
    setFilterPerson('')
    setFilterType('')
  }

  function openDay(date: string) {
    setViewMode('month')
    setMonthAnchor(date)
    setSelectedDay(date)
    setSelectedEntry(null)
    setDeepLinkError(false)
    setQueryParam('date', date)
  }

  function openEntry(entry: CalendarEntry) {
    setSelectedEntry(entry)
    setSelectedDay(null)
    setDeepLinkError(false)
    // The current view already has the resolved entry. Mark this URL state as
    // handled so the deep-link bootstrap does not switch an in-app click back
    // to the month view; direct/reloaded links still use the bootstrap above.
    processedDeepLinkRef.current = `${dateParam ?? ''}|${entry.sourceId}`
    setQueryParam('event', entry.sourceId)
  }

  function openWeek() {
    const selectedDayIsVisible = selectedDay?.slice(0, 7) === monthAnchor.slice(0, 7)
    const anchor = selectedDayIsVisible
      ? selectedDay
      : monthAnchor.slice(0, 7) === today.slice(0, 7) ? today : monthAnchor
    const start = getWeekStart(anchor)
    setWeekStart(start)
    setSelectedWeekDay(anchor)
    setViewMode('week')
  }

  function goToday() {
    if (viewMode === 'week') {
      setWeekStart(getWeekStart(today))
      setSelectedWeekDay(today)
      setWeekScrollVersion((version) => version + 1)
      return
    }
    setMonthAnchor(today)
  }

  function closeEntry() {
    setSelectedEntry(null)
    if (eventParam !== null) removeQueryParam('event')
  }

  function closeDay() {
    setSelectedDay(null)
    if (dateParam !== null) removeQueryParam('date')
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
          <button type="button" className="header-action-button" onClick={goToday}>
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
          aria-selected={viewMode === 'week'}
          className={`tab-button${viewMode === 'week' ? ' active' : ''}`}
          onClick={openWeek}
        >
          {t.calendar.viewWeek}
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

      {deepLinkError && <p className="error" role="alert">{t.deepLinks.notFound}</p>}

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
            <MonthGrid
              monthAnchor={monthAnchor}
              entries={entries}
              today={today}
              selectedDay={selectedDay}
              memberById={memberById}
              onSelectDay={openDay}
            />
          )}
          {selectedDay && (
            <section className="calendar-day-agenda" aria-labelledby="selected-day-title">
              <div className="calendar-day-agenda-header">
                <div>
                  <span className="page-eyebrow">{t.calendar.viewAgenda}</span>
                  <h2 id="selected-day-title">{formatFullDate(selectedDay)}</h2>
                </div>
                <button type="button" className="calendar-day-close" onClick={closeDay} aria-label={t.calendar.close}>×</button>
              </div>
              {dayEntries.length === 0 ? (
                <p className="empty-state">{t.calendar.noEntries}</p>
              ) : (
                <ul className="section-list calendar-day-list">
                  {dayEntries.map((entry) => (
                    <CalendarEntryRow key={entry.id} entry={entry} memberById={memberById} onClick={() => openEntry(entry)} />
                  ))}
                </ul>
              )}
              <button type="button" className="btn-secondary calendar-day-add" onClick={() => setCreateConfig({ initialDate: selectedDay })}>
                <span aria-hidden="true">+</span> {t.create.addThisDayAction}
              </button>
            </section>
          )}
        </>
      )}

      {viewMode === 'week' && (
        <WeekAgenda
          weekStart={weekStart}
          entries={entries}
          today={today}
          selectedDay={selectedWeekDay}
          scrollVersion={weekScrollVersion}
          memberById={memberById}
          onChangeWeek={(nextWeek) => {
            setWeekStart(nextWeek)
            const nextDates = getWeekDates(nextWeek)
            setSelectedWeekDay(nextDates.includes(today) ? today : nextWeek)
          }}
          onSelectDay={setSelectedWeekDay}
          onSelectEntry={openEntry}
          onAddDay={(date) => setCreateConfig({ initialDate: date })}
        />
      )}

      {viewMode === 'agenda' && (
        <section className="section">
          {entries.length === 0 && hasFilters ? (
            <p className="empty-state">{t.calendar.filtersNoResults}</p>
          ) : (
            <AgendaList entries={deduplicateAgendaRanges(entries)} today={today} memberById={memberById} onSelectEntry={openEntry} />
          )}
        </section>
      )}

      {hasFilters && (
        <button type="button" className="link section-footer-link" onClick={clearFilters}>
          {t.calendar.clearFilters}
        </button>
      )}

      {selectedEntry && (
        <CalendarEntryDetailModal
          entry={selectedEntry}
          onClose={closeEntry}
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
