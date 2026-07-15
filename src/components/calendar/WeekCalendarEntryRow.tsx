import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { t } from '../../strings'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import { DueBadge } from '../ui/DueBadge'
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

export function WeekCalendarEntryRow({ entry, memberById, onClick, onAssignmentClick }: Props) {
  const style = getItemTypeStyle(entry.type)
  const participantIds = [...new Set([
    ...(entry.participantMemberIds ?? []),
    ...(entry.childOrPatientId ? [entry.childOrPatientId] : []),
  ])]
  const participantNames = participantIds.map((id) => memberById(id)?.display_name).filter(Boolean).join(', ')
  const responsible = entry.responsibleMemberId ? memberById(entry.responsibleMemberId) : undefined
  const showResponsible = responsible && !participantIds.includes(responsible.id)
  const hasAssignmentControl = Boolean(entry.assignmentSeriesType && onAssignmentClick)
  const timeLabel = entry.time
    ? `${shortTime(entry.time)}${entry.endTime ? `–${shortTime(entry.endTime)}` : ''}`
    : entry.allDay ? t.calendar.allDay : t.calendar.noTime

  return <li className={`week-entry${entry.completed ? ' completed' : ''}`}>
    <button type="button" className="week-entry-button" onClick={onClick}>
      <span className="week-entry-time font-tabular">{timeLabel}</span>
      <span className="week-entry-icon" style={{ color: `var(${style.colorVar})`, backgroundColor: `var(${style.surfaceVar})` }}>{style.icon}</span>
      <span className="week-entry-content">
        <span className="week-entry-title-line">
          <strong>{entry.title}</strong>
          {entry.completed && <span className="week-entry-status">{t.calendar.completed}</span>}
        </span>
        <span className="week-entry-meta">{style.label}{participantNames ? ` · ${participantNames}` : ''}{entry.recurring ? ` · ↻ ${t.calendar.recurring}` : ''}</span>
        {showResponsible && <span className="week-entry-meta">{t.calendar.responsibleLabel(responsible.display_name)}</span>}
        {entry.subtitle && entry.subtitle !== entry.location && <span className="week-entry-meta">{entry.subtitle}</span>}
        {entry.location && <span className="week-entry-meta"><span aria-hidden="true">⌖</span> {entry.location}</span>}
      </span>
      <span className="week-entry-side">
        {!hasAssignmentControl && participantIds.length > 0 && <span className="avatar-stack">
          {participantIds.slice(0, 2).map((id) => <MemberAvatar key={id} member={memberById(id)} size={24} />)}
          {participantIds.length > 2 && <span className="avatar-more">+{participantIds.length - 2}</span>}
        </span>}
        {!entry.completed && <DueBadge dueDate={entry.date} />}
      </span>
    </button>
    {hasAssignmentControl && <button
      type="button"
      className="week-entry-assignment"
      aria-label={`${entry.assignmentSeriesType === 'activity' ? t.calendar.changeCompanion : t.calendar.changeAssignee}${entry.assignmentOverridden ? `. ${t.calendar.occurrenceOverrideBadge}` : ''}`}
      onClick={onAssignmentClick}
    ><MemberAvatar member={responsible} size={36} />{entry.assignmentOverridden && <span className="assignment-override-indicator" aria-hidden="true">↔</span>}</button>}
  </li>
}

