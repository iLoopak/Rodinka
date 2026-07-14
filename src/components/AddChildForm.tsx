import { useState } from 'react'
import { t } from '../strings'
import { MemberAvatarPhotoField } from './family/MemberAvatarPhotoField'
import type { AvatarValidationError } from '../utils/memberAvatarImage'

interface Props {
  onSubmit: (displayName: string, avatarFile: File | null) => Promise<void>
}

function avatarErrorMessage(error: AvatarValidationError | 'corrupt'): string {
  if (error === 'empty') return t.family.errors.avatarEmpty
  if (error === 'too_large') return t.family.errors.avatarTooLarge
  if (error === 'corrupt') return t.family.errors.avatarCorrupt
  return t.family.errors.avatarUnsupported
}

export function AddChildForm({ onSubmit }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onSubmit(displayName, avatarFile)
      setDisplayName('')
      setAvatarFile(null)
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
        <MemberAvatarPhotoField
          displayName={displayName}
          colorKey={null}
          value={avatarFile}
          removed={false}
          disabled={loading}
          onChange={(file) => { setAvatarFile(file); setError(null) }}
          onRemove={() => setAvatarFile(null)}
          onError={(avatarError) => setError(avatarErrorMessage(avatarError))}
        />
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
