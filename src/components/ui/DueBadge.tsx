import { t } from '../../strings'
import { classifyDueDate, formatDueDateLabel } from '../../utils/dueDate'

interface Props {
  dueDate?: string | null
  completed?: boolean
}

// Shared due-date badge reused by chores, activities, medical records, and
// the calendar/agenda — one place for the overdue/today/thisWeek/upcoming
// visual treatment instead of duplicating it per screen.
export function DueBadge({ dueDate, completed }: Props) {
  if (completed) {
    return <span className="badge badge-done">{t.due.completed}</span>
  }
  if (!dueDate) return null

  const urgency = classifyDueDate(dueDate)
  const label = formatDueDateLabel(dueDate)

  if (urgency === 'overdue') {
    return <span className="badge badge-overdue">{label}</span>
  }
  if (urgency === 'today') {
    return <span className="badge badge-today">{label}</span>
  }
  return <span className="row-meta">{label}</span>
}
