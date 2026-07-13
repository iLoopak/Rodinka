import { useState } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { useRouter, type Route } from '../router'
import { buildCalendarEntries, type CalendarEntry } from '../utils/calendarEntries'
import { getChoreState } from '../utils/choreState'
import { addDays, formatFullDate, formatMonthYear, todayISODate } from '../utils/dueDate'
import { getMonthGridRange, shiftMonth } from '../utils/monthGrid'
import { getItemTypeStyle, type CalendarItemType } from '../utils/itemTypeStyle'
import { MonthGrid } from './calendar/MonthGrid'
import { AgendaList } from './calendar/AgendaList'
import { CalendarEntryRow } from './calendar/CalendarEntryRow'
import { Modal } from './ui/Modal'
import { ErrorState } from './ui/ErrorState'
import { recordToInput } from './MedicalDetailModal'

type ViewMode = 'month' | 'agenda'

const ITEM_TYPES: CalendarItemType[] = ['chore', 'activity', 'payment', 'medical', 'vaccination']
const AGENDA_PAST_DAYS = 180
const AGENDA_FUTURE_DAYS = 60

export function CalendarScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [monthAnchor, setMonthAnchor] = useState(todayISODate())
  const [filterPerson, setFilterPerson] = useState('')
  const [filterType, setFilterType] = useState<CalendarItemType | ''>('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null)

  const {
    chores,
    activities,
    medicalRecords,
    members,
    memberName,
    latestCompletionFor,
    loading,
    error,
    refreshAll,
  } = useFamilyData()
  const { navigate } = useRouter()

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
    rangeStart: range.start,
    rangeEnd: range.end,
  })

  if (filterPerson) {
    entries = entries.filter((e) => e.childOrPatientId === filterPerson || e.responsibleMemberId === filterPerson)
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
        <button type="button" className="header-action-button" onClick={() => setMonthAnchor(today)}>
          {t.calendar.today}
        </button>
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
            <AgendaList entries={entries} today={today} memberName={memberName} onSelectEntry={setSelectedEntry} />
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
                  memberName={memberName}
                  onClick={() => {
                    setSelectedEntry(entry)
                    setSelectedDay(null)
                  }}
                />
              ))}
            </ul>
          )}
        </Modal>
      )}

      {selectedEntry && (
        <CalendarEntryDetail
          entry={selectedEntry}
          memberName={memberName}
          onClose={() => setSelectedEntry(null)}
          onNavigate={navigate}
        />
      )}
    </>
  )
}

interface DetailProps {
  entry: CalendarEntry
  memberName: (id: string) => string
  onClose: () => void
  onNavigate: (route: Route) => void
}

function CalendarEntryDetail({ entry, memberName, onClose, onNavigate }: DetailProps) {
  const { chores, medicalRecords, latestCompletionFor, markDone, updateMedicalRecord } = useFamilyData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const style = getItemTypeStyle(entry.type)
  const chore = entry.sourceType === 'chore' ? chores.find((c) => c.id === entry.sourceId) : undefined
  const medicalRecord =
    entry.sourceType === 'medical' || entry.sourceType === 'medical_due'
      ? medicalRecords.find((r) => r.id === entry.sourceId)
      : undefined

  const canMarkChoreDone = chore && getChoreState(chore, latestCompletionFor(chore.id)) === 'actionable'
  const canMarkMedicalDone = medicalRecord && medicalRecord.status === 'planned'

  const sourceRoute: Route =
    entry.sourceType === 'chore' ? '/chores' : entry.sourceType === 'activity' || entry.sourceType === 'activity_payment' ? '/activities' : '/health'

  async function handleMarkChoreDone() {
    if (!chore) return
    setBusy(true)
    setError(null)
    try {
      await markDone(chore.id, chore.assigned_to)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleMarkMedicalDone() {
    if (!medicalRecord) return
    setBusy(true)
    setError(null)
    try {
      await updateMedicalRecord(medicalRecord.id, { ...recordToInput(medicalRecord), status: 'completed' })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const personId = entry.childOrPatientId ?? entry.responsibleMemberId
  const showResponsible = entry.responsibleMemberId && entry.responsibleMemberId !== entry.childOrPatientId

  return (
    <Modal title={entry.title} onClose={onClose}>
      <div className="detail-view">
        <p className="row-meta" style={{ color: `var(${style.colorVar})` }}>
          {style.label}
        </p>
        <p className="row-meta">
          {formatFullDate(entry.date)}
          {entry.time ? ` · ${entry.time.slice(0, 5)}` : ''}
        </p>
        {personId && <p className="row-meta">{memberName(personId)}</p>}
        {showResponsible && entry.responsibleMemberId && (
          <p className="row-meta">{t.calendar.responsibleLabel(memberName(entry.responsibleMemberId))}</p>
        )}
        {entry.subtitle && <p className="row-meta">{entry.subtitle}</p>}
      </div>
      <div className="family-actions">
        {canMarkChoreDone && (
          <button onClick={handleMarkChoreDone} disabled={busy}>
            {t.chores.markDone}
          </button>
        )}
        {canMarkMedicalDone && (
          <button onClick={handleMarkMedicalDone} disabled={busy}>
            {t.medical.markCompleted}
          </button>
        )}
        <button
          className="btn-secondary"
          onClick={() => {
            onNavigate(sourceRoute)
            onClose()
          }}
        >
          {t.calendar.openRecord}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </Modal>
  )
}
