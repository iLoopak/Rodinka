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

function MetaIcon({ kind }: { kind: 'person' | 'location' | 'repeat' }) {
  if (kind === 'location') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5c3.3 0 6-2.7 6-6s-2.7-6-6-6-6 2.7-6 6 2.7 6 6 6zm0-10.5c2.5 0 4.5 2 4.5 4.5S10.5 13 8 13 3.5 11 3.5 8.5 5.5 4 8 4z" /><circle cx="8" cy="8" r="1.5" /></svg>
  if (kind === 'repeat') return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.5 5H6.2a2.7 2.7 0 0 0-2.7 1.8M3.5 11h8.3a2.7 2.7 0 0 0 2.7-1.8M10.8 3l1.7 2.1-1.7 2.1M5.2 8.6l-1.7 2.1 1.7 2.1" /></svg>
  return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.2" r="2.4" /><path d="M3.8 13c.4-2.4 1.8-3.7 4.2-3.7s3.8 1.3 4.2 3.7" /></svg>
}

export function CalendarDayAgendaRow({ entry, memberById, onClick, onAssignmentClick }: Props) {
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
    : entry.allDay ? t.calendar.allDay : ''
  const assignmentName = responsible?.display_name ?? t.calendar.unassignedMember

  return <li
    className={`day-agenda-row${entry.completed ? ' completed' : ''}`}
    style={{ '--day-agenda-accent': `var(${style.colorVar})`, '--day-agenda-surface': `var(${style.surfaceVar})` } as CSSProperties}
  >
    <button type="button" className="day-agenda-row-button" onClick={onClick} aria-label={`${style.label}: ${entry.title}${timeLabel ? `, ${timeLabel}` : ''}`}>
      <div className="day-agenda-row-layout">
        <ItemTypeIcon type={entry.type} category={entry.category} size={24} />
        <div className="day-agenda-row-content">
          <div className="day-agenda-row-heading">
            <strong>{entry.title}</strong>
            {entry.completed && <span className="day-agenda-row-status">{t.calendar.completed}</span>}
            {entry.syncStatus && <span className={`calendar-pending-label ${entry.syncStatus}`}>
              <span className="shopping-item-pending" aria-hidden="true" />
              {entry.syncStatus === 'failed' ? t.calendar.syncRecordFailed : entry.syncStatus === 'syncing' ? t.calendar.syncRecordSyncing : t.calendar.pendingSync}
            </span>}
          </div>
          <div className="day-agenda-row-meta">
            {timeLabel && <span className="day-agenda-row-time font-tabular">{timeLabel}</span>}
            {showParticipants && (
              <span className="day-agenda-row-meta-item">
                <MetaIcon kind="person" />
                {participantNames}
              </span>
            )}
            {hasAssignmentControl && (
              <button
                type="button"
                className="day-agenda-row-assignment"
                aria-label={`${entry.assignmentSeriesType === 'activity' ? t.calendar.changeCompanion : t.calendar.changeAssignee}: ${assignmentName}${entry.assignmentOverridden ? `. ${t.calendar.occurrenceOverrideBadge}` : ''}`}
                onClick={(e) => { e.stopPropagation(); onAssignmentClick?.(); }}
              >
                <MemberAvatar member={responsible} size={24} />
                <span>{assignmentName}</span>
                <svg className="day-agenda-row-swap" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5h10m-3-3 3 3-3 3M13 10.5H3m3 3-3-3 3-3" /></svg>
                {entry.assignmentOverridden && <span className="day-agenda-row-override-dot"><span className="sr-only">{t.calendar.occurrenceOverrideBadge}</span></span>}
              </button>
            )}
            {!hasAssignmentControl && showResponsible && (
              <span className="day-agenda-row-meta-item day-agenda-row-responsible">
                <MemberAvatar member={responsible} size={20} />
                {responsible.display_name}
              </span>
            )}
            {entry.subtitle && entry.subtitle !== entry.location && (
              <span className="day-agenda-row-meta-item">
                <MetaIcon kind="person" />
                {entry.subtitle}
              </span>
            )}
            {entry.location && (
              <span className="day-agenda-row-meta-item">
                <MetaIcon kind="location" />
                {entry.location}
              </span>
            )}
            {entry.recurring && (
              <span className="day-agenda-row-meta-item">
                <MetaIcon kind="repeat" />
                {entry.recurrenceLabel ?? t.calendar.recurring}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  </li>
}