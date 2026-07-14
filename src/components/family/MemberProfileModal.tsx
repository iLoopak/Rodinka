import { useEffect, useMemo, useState } from 'react'
import { t } from '../../strings'
import type { FamilyMember, GrammaticalGender, MemberColorKey } from '../../hooks/useFamilyMembers'
import { MemberProfileError, useMemberProfiles } from '../../hooks/useMemberProfiles'
import { editableMemberProfileFields } from '../../utils/memberProfilePermissions'
import { MEMBER_COLOR_KEYS, MEMBER_COLOR_VAR_BY_KEY, memberColorKey } from '../../utils/memberColor'
import { validateMemberAvatarFile, type AvatarValidationError } from '../../utils/memberAvatarImage'
import { Modal } from '../ui/Modal'
import { MemberAvatar } from '../ui/MemberAvatar'

interface Props {
  member: FamilyMember
  currentMember: FamilyMember
  refreshMembers: () => Promise<void>
  onClose: () => void
}

const COLOR_LABELS: Record<MemberColorKey, string> = {
  brick: t.family.colorBrick,
  coral: t.family.colorCoral,
  sky: t.family.colorSky,
  sage: t.family.colorSage,
  honey: t.family.colorHoney,
  lavender: t.family.colorLavender,
  berry: t.family.colorBerry,
}

const GENDER_OPTIONS: Array<{ value: GrammaticalGender | null; label: string }> = [
  { value: 'masculine', label: t.family.grammarMasculine },
  { value: 'feminine', label: t.family.grammarFeminine },
  { value: 'neutral', label: t.family.grammarNeutral },
  { value: null, label: t.family.grammarUnspecified },
]

function avatarValidationMessage(error: AvatarValidationError): string {
  if (error === 'empty') return t.family.errors.avatarEmpty
  if (error === 'too_large') return t.family.errors.avatarTooLarge
  return t.family.errors.avatarUnsupported
}

function mutationErrorMessage(error: unknown): string {
  if (!(error instanceof MemberProfileError)) return t.family.errors.profileSaveFailed
  if (error.code === 'empty' || error.code === 'too_large' || error.code === 'unsupported') {
    return avatarValidationMessage(error.code)
  }
  if (error.code === 'upload_failed') return t.family.errors.avatarUploadFailed
  return t.family.errors.profileSaveFailed
}

export function MemberProfileModal({ member, currentMember, refreshMembers, onClose }: Props) {
  const fields = editableMemberProfileFields(currentMember, member)
  const { saveMemberProfile } = useMemberProfiles(refreshMembers)
  const [displayName, setDisplayName] = useState(member.display_name)
  const [birthDate, setBirthDate] = useState(member.birth_date ?? '')
  const [colorKey, setColorKey] = useState<MemberColorKey>(memberColorKey(member))
  const [colorTouched, setColorTouched] = useState(false)
  const [grammaticalGender, setGrammaticalGender] = useState<GrammaticalGender | null>(
    member.grammatical_gender
  )
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    }
  }, [avatarPreviewUrl])

  const previewMember = useMemo<FamilyMember>(
    () => ({
      ...member,
      display_name: displayName || member.display_name,
      color_key: colorKey,
      avatar_url: avatarPreviewUrl ?? (removeAvatar ? null : member.avatar_url),
    }),
    [avatarPreviewUrl, colorKey, displayName, member, removeAvatar]
  )

  function handleAvatarSelection(file: File | undefined) {
    if (!file) return
    const validationError = validateMemberAvatarFile(file)
    if (validationError) {
      setError(avatarValidationMessage(validationError))
      return
    }
    setError(null)
    setAvatarFile(file)
    setAvatarPreviewUrl(URL.createObjectURL(file))
    setRemoveAvatar(false)
  }

  function handleRemoveAvatar() {
    setAvatarFile(null)
    setAvatarPreviewUrl(null)
    setRemoveAvatar(true)
    setError(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (fields.displayName && !displayName.trim()) {
      setError(t.family.errors.nameRequired)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await saveMemberProfile(member, {
        displayName: fields.displayName ? displayName : member.display_name,
        birthDate: fields.birthDate ? birthDate || null : member.birth_date,
        colorKey: colorTouched ? colorKey : member.color_key,
        grammaticalGender,
        avatarFile,
        removeAvatar,
      })
      onClose()
    } catch (saveError) {
      setError(mutationErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={t.family.profileTitle} onClose={saving ? () => undefined : onClose}>
      <form className="member-profile-form sectioned-form" onSubmit={handleSubmit}>
        <section className="form-section profile-photo-section" aria-labelledby="profile-photo-heading">
          <h4 id="profile-photo-heading">{t.family.profilePhoto}</h4>
          <MemberAvatar member={previewMember} size={96} decorative={false} />
          <div className="profile-photo-actions">
            <label className="btn-secondary profile-photo-picker">
              {member.avatar_path || avatarFile ? t.family.changePhoto : t.family.uploadPhoto}
              <input
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={saving}
                onChange={(event) => {
                  handleAvatarSelection(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
            {(member.avatar_path || avatarFile) && !removeAvatar && (
              <button type="button" className="btn-secondary" onClick={handleRemoveAvatar} disabled={saving}>
                {t.family.removePhoto}
              </button>
            )}
          </div>
          {avatarFile && <p className="field-hint">{t.family.photoPending}</p>}
        </section>

        <section className="form-section">
          <label>
            {t.family.nameLabel}
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              readOnly={!fields.displayName}
              required={fields.displayName}
              disabled={saving}
            />
          </label>
          {!fields.displayName && <p className="field-hint">{t.family.parentManagedField}</p>}

          <label>
            {t.family.birthDateLabel}
            <input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              readOnly={!fields.birthDate}
              disabled={saving}
            />
          </label>
          {!fields.birthDate && <p className="field-hint">{t.family.parentManagedField}</p>}

          <dl className="profile-readonly-grid">
            <div>
              <dt>{t.family.roleLabel}</dt>
              <dd>{member.role === 'admin' ? t.family.roleAdmin : member.role === 'parent' ? t.family.roleParent : t.family.roleChild}</dd>
            </div>
            <div>
              <dt>{t.family.accountLabel}</dt>
              <dd>{member.user_id ? t.family.hasAccount : t.family.noAccount}</dd>
            </div>
          </dl>
        </section>

        <fieldset className="form-section profile-fieldset">
          <legend>{t.family.memberColor}</legend>
          <div className="member-color-picker">
            {MEMBER_COLOR_KEYS.map((key) => (
              <label
                key={key}
                className={`member-color-option${colorKey === key ? ' selected' : ''}`}
                title={COLOR_LABELS[key]}
              >
                <input
                  className="visually-hidden"
                  type="radio"
                  name="member-color"
                  value={key}
                  checked={colorKey === key}
                  disabled={saving}
                  onChange={() => {
                    setColorKey(key)
                    setColorTouched(true)
                  }}
                />
                <span className="member-color-swatch" style={{ backgroundColor: `var(${MEMBER_COLOR_VAR_BY_KEY[key]})` }}>
                  {colorKey === key && <span aria-hidden="true">✓</span>}
                </span>
                <span className="visually-hidden">{COLOR_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="form-section profile-fieldset">
          <legend>{t.family.grammarTitle}</legend>
          <p className="field-hint">{t.family.grammarExplain}</p>
          <div className="member-gender-options">
            {GENDER_OPTIONS.map((option) => {
              const value = option.value ?? 'unspecified'
              return (
                <label key={value} className="member-gender-option">
                  <input
                    type="radio"
                    name="grammatical-gender"
                    value={value}
                    checked={grammaticalGender === option.value}
                    disabled={saving}
                    onChange={() => setGrammaticalGender(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? t.family.savingProfile : t.family.saveProfile}
        </button>
      </form>
    </Modal>
  )
}
