import { useActiveFamilyMark } from '../../hooks/useActiveFamilyMark'
import { FamilyMark } from '../FamilyMark'
import { AppPrimaryAddButton } from './AddAction'

interface Props {
  title: string
  body?: string
  /**
   * `variant: 'primary'` is for a "create the first record" action — it
   * renders as the shared add button (filled, leading "+"). Omit it (or pass
   * 'secondary') for anything else an empty state offers, like retry or
   * clear filters, which stay neutral so they don't compete with a real
   * create action for attention.
   */
  action?: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' }
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
      {action && (action.variant === 'primary'
        ? <AppPrimaryAddButton onClick={action.onClick}>{action.label}</AppPrimaryAddButton>
        : <button className="btn-secondary" onClick={action.onClick}>{action.label}</button>)}
    </div>
  )
}
