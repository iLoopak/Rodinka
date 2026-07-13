import { t } from '../../strings'

interface Props {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: Props) {
  return (
    <div className="error-state-card">
      <p className="error">{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          {t.errors.retry}
        </button>
      )}
    </div>
  )
}
