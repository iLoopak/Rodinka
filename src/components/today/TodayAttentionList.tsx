import { useState } from 'react'
import { Link } from '../../router'
import { t } from '../../strings'
import type { TodayAttentionItem } from '../../utils/todayAgenda'
import { ItemTypeIcon } from '../ui/ItemTypeIcon'
import { MemberAvatar } from '../ui/MemberAvatar'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { todayAttentionReasonLabel } from './todayAttentionReason'

interface Props {
  items: TodayAttentionItem[]
  memberById: (id: string) => FamilyMember | undefined
  onComplete?: (choreId: string) => Promise<unknown>
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

function AttentionChoreCheckbox({ choreId, onComplete }: { choreId: string; onComplete: (id: string) => Promise<unknown> }) {
  const [completing, setCompleting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    if (completing || done) return
    setCompleting(true)
    try {
      await onComplete(choreId)
      setDone(true)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <button
      type="button"
      className="completion-checkbox today-attention-checkbox"
      aria-pressed={done}
      aria-label={t.today.completeChoreAction}
      disabled={completing}
      onClick={handleClick}
    >
      <span aria-hidden="true">{done ? '✓' : ''}</span>
    </button>
  )
}

export function TodayAttentionList({ items, memberById, onComplete }: Props) {
  return (
    <ul className="today-attention-list">
      {items.map((item) => {
        const personId = item.personId ?? item.responsibleMemberId
        const person = personId ? memberById(personId) : undefined
        const people = peopleLabel(item, memberById)
        const showCheckbox = item.kind === 'overdue_chore' && item.choreId && onComplete
        return (
          <li key={item.id}>
            <div className="today-attention-row">
              {showCheckbox && (
                <AttentionChoreCheckbox
                  choreId={item.choreId!}
                  onComplete={onComplete!}
                />
              )}
              <Link to={item.route} hash={item.hash} className="today-attention-link">
                <ItemTypeIcon type={item.itemType} size={32} />
                {personId && (
                  <MemberAvatar member={person} size={26} />
                )}
                <span className="today-attention-copy">
                  <span className="today-attention-title">{item.title}</span>
                  <span className="today-attention-reason">{todayAttentionReasonLabel(item)}</span>
                  {people && <span className="today-attention-people">{people}</span>}
                </span>
                {!showCheckbox && <span className="today-attention-action">{t.today.resolveAction}</span>}
              </Link>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
