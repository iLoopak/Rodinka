import { useState } from 'react'
import { t } from '../strings'

interface Props {
  onSubmit: (displayName: string) => Promise<void>
}

export function AddChildForm({ onSubmit }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onSubmit(displayName)
      setDisplayName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="add-child-form">
      <h3>{t.chores.addChildTitle}</h3>
      <form onSubmit={handleSubmit}>
        <label>
          {t.chores.childNameLabel}
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t.chores.childNamePlaceholder}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? t.chores.addingChild : t.chores.addChildSubmit}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
