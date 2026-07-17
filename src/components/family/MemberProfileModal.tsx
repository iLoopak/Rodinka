import { useState } from 'react'
import { t } from '../../strings'
import { getCurrentLanguage } from '../../i18n'
import type { FamilyMember, GrammaticalGender, MemberColorKey } from '../../hooks/useFamilyMembers'
import { MemberProfileError, useMemberProfiles } from '../../hooks/useMemberProfiles'
import { editableMemberProfileFields } from '../../utils/memberProfilePermissions'
import { MEMBER_COLOR_KEYS, getMemberMainColor, getMemberColor, memberColorKey } from '../../utils/memberColor'
import type { AvatarValidationError } from '../../utils/memberAvatarImage'
import { Modal } from '../ui/Modal'
import { MemberAvatarPhotoField } from './MemberAvatarPhotoField'
import { getLocalizedAddressName } from '../../utils/personalizedName'
import type { ChildAccount } from '../../hooks/useChildAccounts'
import { canManageChildAccount, childAccountState, childAccountStatusLabel } from '../../utils/childAccountStatus'
import { canManageAllowance } from '../../utils/allowancePlans'
import { ChildAccountSection } from './ChildAccountSection'
import { AllowanceSection } from './AllowanceSection'

interface Props {
  member: FamilyMember
  currentMember: FamilyMember
  refreshMembers: () => Promise<void>
  onClose: () => void
  onRequestRemove?: () => void
  onRequestLeave?: () => void
  // Only supplied by surfaces that manage accounts (the family screen). A
  // child editing their own profile never receives these, so the management
  // panel cannot render there.
  childAccount?: ChildAccount | null
  onAccountChanged?: () => Promise<void> | void
}

function colorLabel(key: MemberColorKey) {
  const label = getMemberColor(key).label
  return getCurrentLanguage() === 'cs' ? label.cs : label.en
}

function genderOptions(): Array<{ value: GrammaticalGender | null; label: string }> {
  return [
    { value: 'masculine', label: t.family.grammarMasculine },
    { value: 'feminine', label: t.family.grammarFeminine },
    { value: 'neutral', label: t.family.grammarNeutral },
    { value: null, label: t.family.grammarUnspecified },
  ]
}

function avatarValidationMessage(error: AvatarValidationError | 'corrupt'): string {
  if (error === 'empty') return t.family.errors.avatarEmpty
  if (error === 'too_large') return t.family.errors.avatarTooLarge
  if (error === 'corrupt') return t.family.errors.avatarCorrupt
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

export function MemberProfileModal({ member, currentMember, refreshMembers, onClose, onRequestRemove, onRequestLeave, childAccount = null, onAccountChanged }: Props) {
  const fields = editableMemberProfileFields(currentMember, member)
  const showAccountManagement = Boolean(onAccountChanged) && canManageChildAccount(currentMember, member)
  // Adults have no allowance, and a child opening their own profile must not
  // be offered the parent's controls.
  const showAllowance = canManageAllowance(currentMember, member)
  const { saveMemberProfile } = useMemberProfiles(refreshMembers)
  const [displayName, setDisplayName] = useState(member.display_name)
  const [birthDate, setBirthDate] = useState(member.birth_date ?? '')
  const [colorKey, setColorKey] = useState<MemberColorKey>(memberColorKey(member))
  const [grammaticalGender, setGrammaticalGender] = useState<GrammaticalGender | null>(
    member.grammatical_gender
  )
  const [vocativeName, setVocativeName] = useState(member.vocative_name ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPersisted, setAvatarPersisted] = useState(false)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vocativePreview = getLocalizedAddressName({
    firstName: displayName,
    manualVocative: vocativeName,
    locale: getCurrentLanguage(),
  })

  function handleRemoveAvatar() {
    setAvatarFile(null)
    setAvatarPersisted(false)
    setRemoveAvatar(true)
    setError(null)
  }

  // The crop editor's own Save button persists the photo immediately —
  // independent of whatever unsaved edits are sitting in the rest of this
  // form — using the member's current (already-persisted) other fields, so
  // it doesn't accidentally commit in-progress name/birthdate/etc changes.
  async function handleSaveAvatar(file: File) {
    try {
      await saveMemberProfile(member, {
        displayName: member.display_name,
        birthDate: member.birth_date,
        colorKey: memberColorKey(member),
        grammaticalGender: member.grammatical_gender,
        vocativeName: member.vocative_name,
        avatarFile: file,
        removeAvatar: false,
      })
    } catch (saveError) {
      throw new Error(mutationErrorMessage(saveError))
    }
    setAvatarFile(file)
    setRemoveAvatar(false)
    setAvatarPersisted(true)
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
        colorKey,
        grammaticalGender,
        vocativeName: vocativeName || null,
        avatarFile: avatarPersisted ? null : avatarFile,
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
        <MemberAvatarPhotoField
          displayName={displayName}
          colorKey={colorKey}
          existingAvatarUrl={member.avatar_url}
          hasExistingPhoto={!!member.avatar_path}
          value={avatarFile}
          removed={removeAvatar}
          disabled={saving}
          onSave={handleSaveAvatar}
          onRemove={handleRemoveAvatar}
          onError={(validationError) => setError(avatarValidationMessage(validationError))}
        />

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
            {t.family.vocativeNameLabel}
            <input
              value={vocativeName}
              onChange={(event) => setVocativeName(event.target.value)}
              readOnly={!fields.vocativeName}
              disabled={saving}
              maxLength={120}
            />
          </label>
          <p className="field-hint">{fields.vocativeName ? t.family.vocativeNameHelp : t.family.parentManagedField}</p>
          {vocativePreview && (
            <p className="vocative-preview" aria-live="polite">
              {t.family.vocativePreview(vocativePreview)}
            </p>
          )}

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
              <dd>{member.role === 'child'
                ? childAccountStatusLabel(childAccountState(member, childAccount))
                : member.user_id ? t.family.hasAccount : t.family.noAccount}</dd>
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
                title={colorLabel(key)}
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
                  }}
                />
                <span className="member-color-swatch" style={{ backgroundColor: getMemberMainColor(key) }}>
                  {colorKey === key && <span aria-hidden="true">✓</span>}
                </span>
                <span className="visually-hidden">{colorLabel(key)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="form-section profile-fieldset">
          <legend>{t.family.grammarTitle}</legend>
          <p className="field-hint">{t.family.grammarExplain}</p>
          <div className="member-gender-options">
            {genderOptions().map((option) => {
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
        {(onRequestRemove || onRequestLeave) && <section className="member-danger-zone" aria-labelledby="member-danger-zone-title">
          <h4 id="member-danger-zone-title">{t.family.dangerZone}</h4>
          {onRequestRemove && <button type="button" className="btn-danger" disabled={saving} onClick={onRequestRemove}>{t.family.removeMemberAction}</button>}
          {onRequestLeave && <button type="button" className="btn-danger" disabled={saving} onClick={onRequestLeave}>{t.family.leaveHouseholdAction}</button>}
        </section>}
      </form>

      {/* Deliberately siblings of the profile form, not children of it: these
          panels carry their own forms and dialogs, and this Modal renders
          inline rather than through a portal. */}
      {showAllowance && <AllowanceSection child={member} />}

      {showAccountManagement && <ChildAccountSection
        child={member}
        account={childAccount}
        onChanged={() => onAccountChanged?.()}
      />}
    </Modal>
  )
}
