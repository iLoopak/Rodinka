import { useState } from 'react'
import { t } from '../../strings'

interface Props {
  message: string
  onRetry?: () => void | Promise<void>
}

export function ErrorState({ message, onRetry }: Props) {
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    if (!onRetry || retrying) return
    setRetrying(true)
    try { await onRetry() } finally { setRetrying(false) }
  }

  return (
    <div className="error-state-card">
      <p className="error" role="alert">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" disabled={retrying} onClick={() => void retry()}>
          {retrying ? t.errors.retrying : t.errors.retry}
        </button>
      )}
    </div>
  )
}
