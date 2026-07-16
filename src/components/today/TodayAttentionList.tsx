import { Link } from '../../router'
import { t } from '../../strings'
import { formatDueDateLabel } from '../../utils/dueDate'
import type { TodayAttentionItem } from '../../utils/todayAgenda'
import { ItemTypeIcon } from '../ui/ItemTypeIcon'
import { MemberAvatar } from '../ui/MemberAvatar'
import type { FamilyMember } from '../../hooks/useFamilyMembers'

interface Props {
  items: TodayAttentionItem[]
  memberById: (id: string) => FamilyMember | undefined
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
    case 'allowance_due':
      return t.today.attentionAllowanceReason(date ?? t.due.today)
  }
}

function peopleLabel(item: TodayAttentionItem, memberById: (id: string) => FamilyMember | undefined): string | null {
  const person = item.personId ? memberById(item.personId)?.display_name : null
  const responsible = item.responsibleMemberId ? memberById(item.responsibleMemberId)?.display_name : null
  if (item.kind === 'overdue_chore') return person ? t.today.choreAssignee(person) : null
  if (item.kind === 'meal_vote') return t.today.attentionVoteAction
  if (item.kind === 'allowance_due') return person ?? null
  if (person && responsible && person !== responsible) return t.today.responsiblePeople(person, responsible)
  return person ?? responsible ?? null
}

export function TodayAttentionList({ items, memberById }: Props) {
  return (
    <ul className="today-attention-list">
      {items.map((item) => {
        const personId = item.personId ?? item.responsibleMemberId
        const person = personId ? memberById(personId) : undefined
        const people = peopleLabel(item, memberById)
        return (
          <li key={item.id}>
            <Link to={item.route} hash={item.hash} className="today-attention-link">
              <ItemTypeIcon type={item.itemType} size={32} />
              {personId && (
                <MemberAvatar member={person} size={26} />
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
