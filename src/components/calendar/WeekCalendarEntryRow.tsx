import type { CSSProperties } from 'react'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { t } from '../../strings'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import { ItemTypeIcon } from '../ui/ItemTypeIcon'
import { MemberAvatar } from '../ui/MemberAvatar'

interface Props {
  entry: CalendarEntry
  memberById: (id: string) => FamilyMember | undefined
  onClick: () => void
  onAssignmentClick?: () => void
}

function shortTime(value: string) {
  return value.slice(0, 5)
}

function WeekMetaIcon({ kind }: { kind: 'person' | 'location' | 'repeat' }) {
  if (kind === 'location') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 18s5-4.8 5-10a5 5 0 1 0-10 0c0 5.2 5 10 5 10Z" /><circle cx="10" cy="8" r="1.7" /></svg>
  if (kind === 'repeat') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 6.5H7.2a3.7 3.7 0 0 0-3.5 2.4M4.5 13.5h8.3a3.7 3.7 0 0 0 3.5-2.4M13.6 3.8l2.2 2.7-2.2 2.7M6.4 10.8l-2.2 2.7 2.2 2.7" /></svg>
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6.4" r="3" /><path d="M4.8 16c.5-3 2.3-4.6 5.2-4.6s4.7 1.6 5.2 4.6" /></svg>
}

export function WeekCalendarEntryRow({ entry, memberById, onClick, onAssignmentClick }: Props) {
  const style = getItemTypeStyle(entry.type, entry.category)
  const participantIds = [...new Set([
    ...(entry.participantMemberIds ?? []),
    ...(entry.childOrPatientId ? [entry.childOrPatientId] : []),
  ])]
  const participantNames = participantIds.map((id) => memberById(id)?.display_name).filter(Boolean).join(', ')
  const responsible = entry.responsibleMemberId ? memberById(entry.responsibleMemberId) : undefined
  const showResponsible = responsible && !participantIds.includes(responsible.id)
  const hasAssignmentControl = Boolean(entry.assignmentSeriesType && onAssignmentClick)
  const responsibleIsOnlyParticipant = Boolean(responsible && participantIds.length === 1 && participantIds[0] === responsible.id)
  const showParticipants = Boolean(participantNames) && !(hasAssignmentControl && responsibleIsOnlyParticipant)
  const timeLabel = entry.time
    ? `${shortTime(entry.time)}${entry.endTime ? `–${shortTime(entry.endTime)}` : ''}`
    : entry.allDay ? t.calendar.allDay : t.calendar.noTime
  const assignmentName = responsible?.display_name ?? t.calendar.unassignedMember

  return <li
    className={`week-entry${entry.completed ? ' completed' : ''}`}
    style={{ '--week-entry-accent': `var(${style.colorVar})`, '--week-entry-surface': `var(${style.surfaceVar})` } as CSSProperties}
  >
    <div className="week-entry-layout">
      <div className="week-entry-heading">
        <ItemTypeIcon type={entry.type} category={entry.category} size={40} />
        <strong>{entry.title}</strong>
        {entry.completed && <span className="week-entry-status">{t.calendar.completed}</span>}
        {entry.syncStatus && <span className={`calendar-pending-label ${entry.syncStatus}`}>
          <span className="shopping-item-pending" aria-hidden="true" />
          {entry.syncStatus === 'failed' ? t.calendar.syncRecordFailed : entry.syncStatus === 'syncing' ? t.calendar.syncRecordSyncing : t.calendar.pendingSync}
        </span>}
      </div>
      <div className="week-entry-time font-tabular">{timeLabel}</div>
      <div className="week-entry-metadata">
        {showParticipants && <div className="week-entry-meta-row"><span className="week-entry-meta-icon"><WeekMetaIcon kind="person" /></span><span>{participantNames}</span></div>}
        {hasAssignmentControl && <button
          type="button"
          className="week-entry-assignment"
          aria-label={`${entry.assignmentSeriesType === 'activity' ? t.calendar.changeCompanion : t.calendar.changeAssignee}: ${assignmentName}${entry.assignmentOverridden ? `. ${t.calendar.occurrenceOverrideBadge}` : ''}`}
          onClick={onAssignmentClick}
        >
          <MemberAvatar member={responsible} size={30} />
          <span>{assignmentName}</span>
          <svg className="week-entry-swap" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7h11m-3-3 3 3-3 3M16 13H5m3 3-3-3 3-3" /></svg>
          {entry.assignmentOverridden && <span className="week-entry-override-dot"><span className="sr-only">{t.calendar.occurrenceOverrideBadge}</span></span>}
        </button>}
        {!hasAssignmentControl && showResponsible && <div className="week-entry-meta-row"><MemberAvatar member={responsible} size={30} /><span>{responsible.display_name}</span></div>}
        {entry.subtitle && entry.subtitle !== entry.location && <div className="week-entry-meta-row"><span className="week-entry-meta-icon"><WeekMetaIcon kind="person" /></span><span>{entry.subtitle}</span></div>}
        {entry.location && <div className="week-entry-meta-row"><span className="week-entry-meta-icon"><WeekMetaIcon kind="location" /></span><span>{entry.location}</span></div>}
        {entry.recurring && <div className="week-entry-meta-row"><span className="week-entry-meta-icon"><WeekMetaIcon kind="repeat" /></span><span>{entry.recurrenceLabel ?? t.calendar.recurring}</span></div>}
      </div>
    </div>
    <button type="button" className="week-entry-open" onClick={onClick} aria-label={`${style.label}: ${entry.title}, ${timeLabel}`} />
  </li>
}
