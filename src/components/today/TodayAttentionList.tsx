import { Link } from '../../router'
import { t } from '../../strings'
import { formatDueDateLabel } from '../../utils/dueDate'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import type { TodayAttentionItem } from '../../utils/todayAgenda'
import { MemberAvatar } from '../ui/MemberAvatar'

interface Props {
  items: TodayAttentionItem[]
  memberName: (id: string) => string
}

function reasonLabel(item: TodayAttentionItem): string {
  const date = item.date ? formatDueDateLabel(item.date) : null
  switch (item.kind) {
    case 'overdue_chore':
      return t.today.attentionChoreReason(date ?? t.due.overdue)
    case 'overdue_payment':
      return t.today.attentionPaymentReason(date ?? t.due.overdue)
    case 'overdue_medical':
      return t.today.attentionMedicalReason(date ?? t.due.overdue)
    case 'meal_vote':
      return t.today.attentionVoteReason
  }
}

function peopleLabel(item: TodayAttentionItem, memberName: (id: string) => string): string | null {
  const person = item.personId ? memberName(item.personId) : null
  const responsible = item.responsibleMemberId ? memberName(item.responsibleMemberId) : null
  if (item.kind === 'overdue_chore') return person ? t.today.choreAssignee(person) : null
  if (item.kind === 'meal_vote') return t.today.attentionVoteAction
  if (person && responsible && person !== responsible) return t.today.responsiblePeople(person, responsible)
  return person ?? responsible
}

export function TodayAttentionList({ items, memberName }: Props) {
  return (
    <ul className="today-attention-list">
      {items.map((item) => {
        const style = getItemTypeStyle(item.itemType)
        const personId = item.personId ?? item.responsibleMemberId
        const people = peopleLabel(item, memberName)
        return (
          <li key={item.id}>
            <Link to={item.route} hash={item.hash} className="today-attention-link">
              <span className="today-attention-icon" style={{ color: `var(${style.colorVar})` }}>
                {style.icon}
              </span>
              {personId && (
                <MemberAvatar member={{ id: personId, display_name: memberName(personId) }} size={26} />
              )}
              <span className="today-attention-copy">
                <span className="today-attention-title">{item.title}</span>
                <span className="today-attention-reason">{reasonLabel(item)}</span>
                {people && <span className="today-attention-people">{people}</span>}
              </span>
              <span className="today-attention-action">{t.today.resolveAction}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
