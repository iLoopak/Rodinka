interface Props {
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, body, action }: Props) {
  return (
    <div className="empty-state-card">
      <span className="empty-state-motif" aria-hidden="true"><i /><i /><i /><i /></span>
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
