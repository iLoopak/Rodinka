import { useActiveFamilyMark } from '../../hooks/useActiveFamilyMark'
import { FamilyMark } from '../FamilyMark'

interface Props {
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, body, action }: Props) {
  const familyMark = useActiveFamilyMark()

  return (
    <div className="empty-state-card">
      <FamilyMark
        variant="dynamic"
        members={familyMark.members}
        loading={familyMark.loading}
        size={48}
        className="empty-state-mark"
      />
      <p className="empty-state-title">{title}</p>
      {body && <p className="empty-state-body">{body}</p>}
      {action && (
        <button className="btn-secondary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
