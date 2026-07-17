import { useEffect, useMemo, useRef, useState } from 'react'
import type { FamilyMember, MemberColorKey } from '../../hooks/useFamilyMembers'
import { t } from '../../strings'
import { validateMemberAvatarFile, type AvatarValidationError } from '../../utils/memberAvatarImage'
import { MemberAvatar } from '../ui/MemberAvatar'
import { AvatarCropEditor } from './AvatarCropEditor'

interface Props {
  displayName: string
  colorKey: MemberColorKey | null
  existingAvatarUrl?: string | null
  hasExistingPhoto?: boolean
  value: File | null
  removed: boolean
  disabled?: boolean
  /** Whether saving `value` is still deferred to an outer form submit (shows the "uploads when you submit" hint). */
  pendingUntilSubmit?: boolean
  /** Crops, then persists the photo (or stages it, depending on the caller). Rejecting keeps the crop dialog open for retry. */
  onSave: (file: File) => Promise<void>
  onRemove: () => void
  onError: (error: AvatarValidationError | 'corrupt') => void
}

export function MemberAvatarPhotoField({
  displayName,
  colorKey,
  existingAvatarUrl = null,
  hasExistingPhoto = false,
  value,
  removed,
  disabled = false,
  pendingUntilSubmit = false,
  onSave,
  onRemove,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(value)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  const previewMember = useMemo<Pick<FamilyMember, 'id' | 'display_name' | 'color_key' | 'avatar_url'>>(() => ({
    id: 'avatar-preview',
    display_name: displayName || '?',
    color_key: colorKey,
    avatar_url: previewUrl ?? (removed ? null : existingAvatarUrl),
  }), [colorKey, displayName, existingAvatarUrl, previewUrl, removed])

  function selectFile(file: File | undefined) {
    if (!file) return
    const validationError = validateMemberAvatarFile(file)
    if (validationError) {
      onError(validationError)
      return
    }
    setSourceFile(file)
  }

  function closeEditor() {
    setSourceFile(null)
    requestAnimationFrame(() => openerRef.current?.focus())
  }

  function openPicker(opener: HTMLButtonElement) {
    openerRef.current = opener
    inputRef.current?.click()
  }

  const hasPhoto = (!!existingAvatarUrl || hasExistingPhoto || !!value) && !removed

  return (
    <>
      <section className="profile-photo-section" aria-labelledby="profile-photo-heading">
        <h4 id="profile-photo-heading" className="visually-hidden">{t.family.profilePhoto}</h4>
        <button
          type="button"
          className="profile-avatar-button"
          onClick={(event) => openPicker(event.currentTarget)}
          disabled={disabled}
          aria-label={hasPhoto ? t.family.changePhoto : t.family.uploadPhoto}
        >
          <MemberAvatar member={previewMember} size={96} decorative={false} />
          <span>{t.family.cropEditBadge}</span>
        </button>
        <div className="profile-photo-actions">
          <button type="button" className="btn-secondary" onClick={(event) => openPicker(event.currentTarget)} disabled={disabled}>
            {hasPhoto ? t.family.changePhoto : t.family.uploadPhoto}
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(event) => {
              selectFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          {hasPhoto && <button type="button" className="btn-link destructive-link profile-photo-remove" onClick={onRemove} disabled={disabled}>{t.family.removePhoto}</button>}
        </div>
        {value && pendingUntilSubmit && <p className="field-hint">{t.family.photoPending}</p>}
        {hasExistingPhoto && !value && !removed && <p className="field-hint">{t.family.cropExistingHint}</p>}
      </section>

      {sourceFile && <AvatarCropEditor
        file={sourceFile}
        onCancel={closeEditor}
        onError={() => onError('corrupt')}
        onSave={async (cropped) => {
          await onSave(cropped)
          closeEditor()
        }}
      />}
    </>
  )
}
