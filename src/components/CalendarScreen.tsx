import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../strings'
import { useCalendarSources } from './calendar/useCalendarSources'
import { buildCalendarEntries, deduplicateAgendaRanges, entryMatchesMember, type CalendarEntry } from '../utils/calendarEntries'
import { getChoreState } from '../utils/choreState'
import { addDays, formatMonthYear, todayISODate } from '../utils/dueDate'
import { getMonthGridRange, shiftMonth } from '../utils/monthGrid'
import { getItemTypeStyle, type CalendarItemType } from '../utils/itemTypeStyle'
import { MonthGrid } from './calendar/MonthGrid'
import { AgendaList } from './calendar/AgendaList'
import { ErrorState } from './ui/ErrorState'
import { EmptyState } from './ui/EmptyState'
import { CalendarEntryDetailModal } from './calendar/CalendarEntryDetailModal'
import { WeekAgenda } from './calendar/WeekAgenda'
import { CalendarDayAgendaCard } from './calendar/CalendarDayAgendaCard'
import { useRouteSearchParams, useRouterActions } from '../router'
import { isValidISODate, isValidUuid } from '../utils/deepLinks'
import { getWeekDates, getWeekStart } from '../utils/weekCalendar'
import { ScrollableTabs } from './ui/ScrollableTabs'
import { FilterDisclosure, FilterDisclosurePanel, FilterDisclosureToggle } from './ui/FilterDisclosure'
import { ScreenHeader } from './ui/ScreenHeader'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { capabilitiesFor } from '../utils/uiCapabilities'
import { useCreateRecord } from '../context/create-record/CreateRecordContext'
import { Button, IconButton } from '../components/ui/Button'

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
  const { currentMember } = useFamilyCore()
  const capabilities = capabilitiesFor(currentMember)
  const [viewMode, setViewMode] = useState<ViewMode>(storedCalendarView)
  const [monthAnchor, setMonthAnchor] = useState(todayISODate())
  const [weekStart, setWeekStart] = useState(() => getWeekStart(todayISODate()))
  const [selectedWeekDay, setSelectedWeekDay] = useState(todayISODate())
  const [weekScrollVersion, setWeekScrollVersion] = useState(0)
  const [filterPerson, setFilterPerson] = useState('')
  const [filterType, setFilterType] = useState<CalendarItemType | ''>('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null)
  const [openAssignmentInitially, setOpenAssignmentInitially] = useState(false)
  const [deepLinkError, setDeepLinkError] = useState(false)
  const searchParams = useRouteSearchParams()
  const { setQueryParam, removeQueryParam } = useRouterActions()
  const { openCreateRecord } = useCreateRecord()
  const dateParam = searchParams.get('date')
  const eventParam = searchParams.get('event')
  const processedDeepLinkRef = useRef<string | null>(null)

  const {
    chores,
    completions,
    activities,
    medicalRecords,
    planEntries,
    allowancePlans,
    occurrenceOverrides,
    assignmentHistory,
    participantHistory,
    members,
    memberById,
    latestCompletionFor,
    loading,
    error,
    refresh,
    calendarSyncStatus,
    calendarLastSyncedAt,
    pendingCalendarChanges,
    pendingCalendarRecords,
    retryCalendarRecord,
  } = useCalendarSources()

  useEffect(() => {
    if (!loading) void refresh()
  }, [loading, refresh])

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
          (!capabilities.isChild ? medicalRecords.find((item) => item.id === eventParam)?.record_date : null) ??
          planEntries.find((item) => item.id === eventParam)?.entry_date ??
          (!capabilities.isChild ? allowancePlans.find((item) => item.id === eventParam)?.starts_on : null) ??
          null

        const entry = sourceDate
          ? buildCalendarEntries({
              chores,
              choreCompletions: completions,
              activities,
              medicalRecords: capabilities.isChild ? [] : medicalRecords,
              mealPlanEntries: planEntries,
              allowancePlans: capabilities.isChild ? [] : allowancePlans,
              occurrenceOverrides,
              assignmentHistory,
              participantHistory,
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
  }, [activities, allowancePlans, assignmentHistory, capabilities.isChild, chores, completions, dateParam, error, eventParam, loading, medicalRecords, occurrenceOverrides, participantHistory, planEntries])

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
    const visibleMedical = capabilities.isChild ? [] : medicalRecords.filter((record) => record.status !== 'cancelled')
    let projected = buildCalendarEntries({
      chores: visibleChores, choreCompletions: completions, activities, medicalRecords: visibleMedical, mealPlanEntries: planEntries,
      allowancePlans: capabilities.isChild ? [] : allowancePlans, rangeStart: range.start, rangeEnd: range.end,
      occurrenceOverrides, assignmentHistory,
      participantHistory,
    })
    if (capabilities.isChild) projected = projected.filter((entry) => !['payment', 'allowance', 'medical', 'vaccination'].includes(entry.type))
    if (capabilities.isChild) projected = projected.filter((entry) => entry.type === 'meal' || entryMatchesMember(entry, currentMember.id))
    else if (filterPerson) projected = projected.filter((entry) => entry.type === 'meal' || entryMatchesMember(entry, filterPerson))
    if (filterType) projected = projected.filter((entry) => entry.type === filterType)
    return projected.map((entry) => ({ ...entry, syncStatus: pendingCalendarRecords.get(entry.sourceId)?.status }))
  }, [activities, allowancePlans, assignmentHistory, capabilities.isChild, chores, completions, currentMember.id, filterPerson, filterType, latestCompletionFor, medicalRecords, occurrenceOverrides, participantHistory, pendingCalendarRecords, planEntries, range.end, range.start])

  if (loading) return <p className="loading">{t.loading.generic}</p>
  if (error) return <ErrorState message={t.calendar.dataUnavailable} onRetry={refresh} />

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
    setOpenAssignmentInitially(false)
    setSelectedEntry(entry)
    setSelectedDay(null)
    setDeepLinkError(false)
    // The current view already has the resolved entry. Mark this URL state as
    // handled so the deep-link bootstrap does not switch an in-app click back
    // to the month view; direct/reloaded links still use the bootstrap above.
    processedDeepLinkRef.current = `${dateParam ?? ''}|${entry.sourceId}`
    setQueryParam('event', entry.sourceId)
  }

  function openAssignment(entry: CalendarEntry) {
    setOpenAssignmentInitially(true)
    setSelectedEntry(entry)
    setSelectedDay(null)
    setDeepLinkError(false)
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
    setOpenAssignmentInitially(false)
    if (eventParam !== null) removeQueryParam('event')
  }

  function closeDay() {
    setSelectedDay(null)
    if (dateParam !== null) removeQueryParam('date')
  }

  const dayEntries = selectedDay ? entries.filter((e) => e.date === selectedDay) : []
  const activeFilterCount = Number(Boolean(filterPerson)) + Number(Boolean(filterType))
  const viewTabs: { id: ViewMode; label: string }[] = [
    { id: 'month', label: t.calendar.viewMonth },
    { id: 'week', label: t.calendar.viewWeek },
    { id: 'agenda', label: t.calendar.viewAgenda },
  ]

  function changeView(next: ViewMode) {
    if (next === 'week') openWeek()
    else setViewMode(next)
  }

  return (
    <>
      <FilterDisclosure id="calendar-filter-panel" open={filtersOpen} onOpenChange={setFiltersOpen}
        activeCount={activeFilterCount} onClear={clearFilters}>
      <ScreenHeader title={t.calendar.title} actions={<>
        <FilterDisclosureToggle />
        {capabilities.createPlannerItems && <IconButton
          variant="primary"
          onClick={() => openCreateRecord({ source: 'calendar' })}
          aria-label={t.create.addAction}
        >
          +
        </IconButton>}
        {/* Jumping to today navigates; it must not look like the create
            action beside it. Create stays the one primary here. */}
        <Button variant="secondary" onClick={goToday}>
          {t.calendar.today}
        </Button>
      </>} />

      <ScrollableTabs tabs={viewTabs} activeTab={viewMode} onChange={changeView} />

      {calendarSyncStatus !== 'synced' && <div
        className={`shopping-sync-status calendar-sync-status ${calendarSyncStatus}`}
        role={calendarSyncStatus === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        <span className="shopping-sync-status-dot" aria-hidden="true" />
        <span>{calendarSyncStatus === 'offline'
          ? t.calendar.offlineSnapshot(calendarLastSyncedAt ? new Date(calendarLastSyncedAt).toLocaleString() : t.calendar.neverUpdated)
          : calendarSyncStatus === 'syncing'
            ? t.calendar.syncing(pendingCalendarChanges)
            : t.calendar.syncFailed}</span>
        {calendarSyncStatus === 'error' && <button type="button" className="link" onClick={() => void retryCalendarRecord()}>{t.calendar.syncRetry}</button>}
      </div>}

      {deepLinkError && <p className="error" role="alert">{t.deepLinks.notFound}</p>}

      <FilterDisclosurePanel>
        <div className="filter-row">
          {!capabilities.isChild && <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} aria-label={t.calendar.filterPersonLabel}>
            <option value="">{t.calendar.filterPersonLabel}: {t.calendar.filterAll}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>}
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as CalendarItemType | '')} aria-label={t.calendar.filterTypeLabel}>
            <option value="">{t.calendar.filterTypeLabel}: {t.calendar.filterAll}</option>
            {ITEM_TYPES.map((type) => <option key={type} value={type}>{getItemTypeStyle(type).label}</option>)}
          </select>
        </div>
      </FilterDisclosurePanel>
      </FilterDisclosure>

      {viewMode === 'month' && (
        <>
          <div className="month-nav">
            <button type="button" className="btn-secondary" onClick={() => setMonthAnchor(shiftMonth(monthAnchor, -1))} aria-label={t.calendar.previousMonth}>
              ‹
            </button>
            <span className="month-nav-label">{formatMonthYear(monthAnchor)}</span>
            <button type="button" className="btn-secondary" onClick={() => setMonthAnchor(shiftMonth(monthAnchor, 1))} aria-label={t.calendar.nextMonth}>
              ›
            </button>
          </div>
          {entries.length === 0 && hasFilters ? (
            <EmptyState title={t.calendar.filtersNoResults} action={{ label: t.calendar.clearFilters, onClick: clearFilters }} />
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
            <CalendarDayAgendaCard
              date={selectedDay}
              entries={dayEntries}
              today={today}
              memberById={memberById}
              onSelectEntry={openEntry}
              onChangeAssignment={capabilities.manageTaskDefinitions ? openAssignment : undefined}
              onAddDay={capabilities.createPlannerItems ? (date) => openCreateRecord({ date, source: 'calendar-day' }) : undefined}
              onClose={closeDay}
            />
          )}
        </>
      )}

      {viewMode === 'week' && (
        entries.length === 0 && hasFilters ? <EmptyState title={t.calendar.filtersNoResults} action={{ label: t.calendar.clearFilters, onClick: clearFilters }} /> : <WeekAgenda
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
          onChangeAssignment={capabilities.manageTaskDefinitions ? openAssignment : undefined}
          onAddDay={capabilities.createPlannerItems ? (date) => openCreateRecord({ date, source: 'calendar-day' }) : undefined}
        />
      )}

      {viewMode === 'agenda' && (
        <section className="page-section">
          {entries.length === 0 && hasFilters ? (
            <div className="panel is-quiet">
              <EmptyState title={t.calendar.filtersNoResults} action={{ label: t.calendar.clearFilters, onClick: clearFilters }} />
            </div>
          ) : (
            /* Each date bucket owns its own panel (see .agenda-group-list), so
               the list is not wrapped in a second surface here. */
            <AgendaList entries={deduplicateAgendaRanges(entries)} today={today} memberById={memberById} onSelectEntry={openEntry} />
          )}
        </section>
      )}

      {selectedEntry && (
        <CalendarEntryDetailModal
          entry={selectedEntry}
          openAssignmentInitially={openAssignmentInitially}
          onClose={closeEntry}
        />
      )}

    </>
  )
}
