import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'

interface Props {
  familyId: string
  onAdded: () => void
}

export function AddChildForm({ familyId, onAdded }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase
      .from('members')
      .insert({ family_id: familyId, display_name: displayName, role: 'child' })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setDisplayName('')
      onAdded()
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
