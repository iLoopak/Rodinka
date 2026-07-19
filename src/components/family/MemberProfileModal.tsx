import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../strings'
import { getCurrentLanguage } from '../../i18n'
import type { FamilyMember, GrammaticalGender, MemberColorKey } from '../../hooks/useFamilyMembers'
import { MemberProfileError, useMemberProfiles } from '../../hooks/useMemberProfiles'
import { editableMemberProfileFields } from '../../utils/memberProfilePermissions'
import { MEMBER_COLOR_KEYS, getMemberColorTheme, getMemberMainColor, getMemberColor, memberColorKey, normalizeCustomMemberColor, memberColorStyle } from '../../utils/memberColor'
import type { AvatarValidationError } from '../../utils/memberAvatarImage'
import { Modal } from '../ui/Modal'
import { MemberAvatar } from '../ui/MemberAvatar'
import { ConfirmDestructiveActionDialog } from '../ui/DestructiveActions'
import { MemberAvatarPhotoField } from './MemberAvatarPhotoField'
import { getLocalizedAddressName } from '../../utils/personalizedName'
import type { ChildAccount } from '../../hooks/useChildAccounts'
import { canManageChildAccount, childAccountState, childAccountStatusLabel } from '../../utils/childAccountStatus'
import { canManageAllowance } from '../../utils/allowancePlans'
import { ChildAccountSection } from './ChildAccountSection'
import { AllowanceSection } from './AllowanceSection'
import { useOptionalCreateRecord, type RecordType } from '../../context/create-record/CreateRecordContext'

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
  // Registered account email for an adult member, visible only to adults of the
  // same family (resolved via the family_member_emails RPC upstream). Null when
  // the member has no connected account, and irrelevant for children — their
  // synthetic managed-account identifier is never an email.
  accountEmail?: string | null
}

type EditorSection = 'profile' | 'allowance' | 'access' | 'other'

const FORM_ID = 'member-profile-form'

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

export function MemberProfileModal({ member, currentMember, refreshMembers, onClose, onRequestRemove, onRequestLeave, childAccount = null, onAccountChanged, accountEmail = null }: Props) {
  const createRecord = useOptionalCreateRecord()
  const fields = editableMemberProfileFields(currentMember, member)
  const showAccountManagement = Boolean(onAccountChanged) && canManageChildAccount(currentMember, member)
  // Adults have no allowance, and a child opening their own profile must not
  // be offered the parent's controls.
  const showAllowance = canManageAllowance(currentMember, member)
  const showOther = Boolean(onRequestRemove || onRequestLeave)
  const { saveMemberProfile } = useMemberProfiles(refreshMembers)
  const [displayName, setDisplayName] = useState(member.display_name)
  const [birthDate, setBirthDate] = useState(member.birth_date ?? '')
  const [colorKey, setColorKey] = useState<MemberColorKey | null>(member.custom_color ? null : memberColorKey(member))
  const [customColor, setCustomColor] = useState(member.custom_color ?? '')
  const normalizedCustomColor = normalizeCustomMemberColor(customColor)
  const colorTheme = getMemberColorTheme({ id: member.id, color_key: colorKey, custom_color: normalizedCustomColor })
  const [grammaticalGender, setGrammaticalGender] = useState<GrammaticalGender | null>(
    member.grammatical_gender
  )
  const [vocativeName, setVocativeName] = useState(member.vocative_name ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPersisted, setAvatarPersisted] = useState(false)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<EditorSection>('profile')
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [pendingCreateType, setPendingCreateType] = useState<RecordType | null>(null)
  const [emailCopied, setEmailCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Adults show a registered account email (or a subtle placeholder); children
  // never do — their managed-account identifier is not a real email address.
  const showEmail = member.role !== 'child'

  async function copyEmail() {
    if (!accountEmail) return
    try {
      await navigator.clipboard.writeText(accountEmail)
      setEmailCopied(true)
    } catch {
      // Clipboard access fails on insecure contexts or when permission is
      // denied. The email stays selectable on screen, so this is not surfaced.
    }
  }

  const vocativePreview = getLocalizedAddressName({
    firstName: displayName,
    manualVocative: vocativeName,
    locale: getCurrentLanguage(),
  })

  // Section navigation adapts to what this actor is allowed to see. A child
  // editing their own profile only sees "Profil"; a parent editing another
  // adult never sees the allowance or child-access sections.
  const sections = useMemo(() => {
    const list: Array<{ id: EditorSection; label: string }> = [
      { id: 'profile', label: t.family.editor.sectionProfile },
    ]
    if (showAllowance) list.push({ id: 'allowance', label: t.family.editor.sectionAllowance })
    if (showAccountManagement) list.push({ id: 'access', label: t.family.editor.sectionAccess })
    if (showOther) list.push({ id: 'other', label: t.family.editor.sectionOther })
    return list
  }, [showAllowance, showAccountManagement, showOther])

  // The visible section list can shrink out from under us if the caller drops
  // a permission — snap back to Profil rather than render an empty content
  // area.
  useEffect(() => {
    if (!sections.some((s) => s.id === activeSection)) setActiveSection('profile')
  }, [sections, activeSection])

  // Each section starts at its first control instead of inheriting the scroll
  // position from the previously active section.
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [activeSection])

  // The photo is persisted immediately by the crop editor, so any local
  // avatarFile that we've already committed doesn't count as dirty.
  const isDirty = (
    (fields.displayName && displayName !== member.display_name) ||
    (fields.birthDate && birthDate !== (member.birth_date ?? '')) ||
    colorKey !== (member.custom_color ? null : memberColorKey(member)) ||
    (normalizedCustomColor ?? '') !== (member.custom_color ?? '') ||
    grammaticalGender !== member.grammatical_gender ||
    vocativeName !== (member.vocative_name ?? '') ||
    (avatarFile !== null && !avatarPersisted) ||
    removeAvatar
  )

  function requestClose() {
    if (saving) return
    if (isDirty) {
      setConfirmingDiscard(true)
      return
    }
    onClose()
  }

  function openForMember(type: RecordType) {
    if (!createRecord) return
    if (isDirty) {
      setPendingCreateType(type)
      setConfirmingDiscard(true)
      return
    }
    onClose()
    createRecord.openCreateRecord({ type, memberId: member.id, source: 'member-profile' })
  }

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
        colorKey: member.color_key,
        customColor: member.custom_color ?? null,
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

  async function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault()
    if (fields.displayName && !displayName.trim()) {
      setError(t.family.errors.nameRequired)
      return
    }

    if (colorKey === null && customColor && !normalizedCustomColor) {
      setError(t.family.errors.customColorInvalid)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await saveMemberProfile(member, {
        displayName: fields.displayName ? displayName : member.display_name,
        birthDate: fields.birthDate ? birthDate || null : member.birth_date,
        colorKey: normalizedCustomColor ? null : colorKey,
        customColor: normalizedCustomColor,
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

  const summaryMember: Pick<FamilyMember, 'id' | 'display_name' | 'color_key' | 'custom_color' | 'avatar_url'> = {
    id: member.id,
    display_name: displayName || member.display_name,
    color_key: colorKey,
    custom_color: normalizedCustomColor,
    avatar_url: removeAvatar ? null : member.avatar_url,
  }

  return (
    <Modal
      title={t.family.editor.title}
      onClose={requestClose}
      closeOnBackdrop={false}
      className="member-editor-sheet"
      backdropClassName="member-editor-backdrop"
    >
      <div className="member-editor-summary">
        <MemberAvatar member={summaryMember} size={44} decorative={false} />
        <div className="member-editor-summary-copy">
          <p className="member-editor-summary-role">
            {member.role === 'admin' ? t.family.roleAdmin : member.role === 'parent' ? t.family.roleParent : t.family.roleChild}
          </p>
          <p className="member-editor-summary-name">{member.display_name}</p>
        </div>
      </div>

      <div className="member-editor-main">
        {sections.length > 1 && (
          <nav className="member-editor-nav" aria-label={t.family.editor.sectionsLabel}>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`member-editor-nav-item${activeSection === section.id ? ' is-active' : ''}`}
                aria-current={activeSection === section.id ? 'page' : undefined}
                aria-pressed={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>
        )}

        <div ref={contentRef} className="member-editor-content">
          {activeSection === 'profile' && (
            <form id={FORM_ID} className="member-profile-form" onSubmit={handleSubmit}>
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

              <section className="member-editor-block" aria-label={t.family.editor.sectionProfile}>
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
                  <div className={showEmail ? 'profile-email-row' : undefined}>
                    <dt>{t.family.accountLabel}</dt>
                    <dd>
                      {member.role === 'child' ? (
                        // Children have their own managed-account lifecycle; their
                        // synthetic identifier is never a real email, so no address
                        // is ever shown here.
                        childAccountStatusLabel(childAccountState(member, childAccount))
                      ) : member.user_id ? (
                        // Linked to a real authenticated account (members.user_id is
                        // the source of truth). Show the login email when the RPC
                        // returned it, plus a subtle "connected account" status.
                        <span className="profile-account is-linked">
                          {accountEmail && (
                            <span className="profile-email-value">
                              <span className="profile-email-address">{accountEmail}</span>
                              <button
                                type="button"
                                className="btn-secondary profile-email-copy"
                                aria-label={t.family.copyEmailFor(member.display_name)}
                                onClick={() => void copyEmail()}
                              >
                                {emailCopied ? t.family.emailCopied : t.family.copyEmail}
                              </button>
                            </span>
                          )}
                          <span className="profile-account-status">{t.family.accountLinked}</span>
                        </span>
                      ) : (
                        // No authenticated account is linked — never render an empty
                        // email or technical id, just a neutral state and a hint.
                        <span className="profile-account">
                          <span className="profile-email-empty">{t.family.emailNoAccount}</span>
                          <span className="field-hint profile-account-hint">{t.family.noAccountHint}</span>
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <fieldset className="member-editor-block profile-fieldset">
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
                          setCustomColor('')
                        }}
                      />
                      <span className="member-color-swatch" style={{ backgroundColor: getMemberMainColor(key) }}>
                        {colorKey === key && !normalizedCustomColor && <span aria-hidden="true">✓</span>}
                      </span>
                      <span className="visually-hidden">{colorLabel(key)}</span>
                    </label>
                  ))}

                  <button
                    type="button"
                    className={`member-color-option member-color-custom${normalizedCustomColor ? ' selected' : ''}`}
                    disabled={saving}
                    onClick={() => {
                      setColorKey(null)
                      setCustomColor(normalizedCustomColor ?? colorTheme.primary)
                    }}
                    aria-pressed={Boolean(normalizedCustomColor)}
                  >
                    <span className="member-color-swatch" style={{ backgroundColor: normalizedCustomColor ?? '#FFFFFF', borderColor: colorTheme.border }}>
                      {normalizedCustomColor && <span aria-hidden="true">✓</span>}
                    </span>
                    <span>{t.family.customColor}</span>
                  </button>
                </div>
                {(colorKey === null || normalizedCustomColor) && (
                  <div className="member-custom-color-panel">
                    <label>
                      <span>{t.family.customColorPicker}</span>
                      <input type="color" value={normalizedCustomColor ?? '#E9785E'} disabled={saving} onChange={(event) => { setColorKey(null); setCustomColor(event.target.value) }} />
                    </label>
                    <label>
                      <span>{t.family.customColorHex}</span>
                      <input value={customColor} disabled={saving} inputMode="text" pattern="#[0-9A-Fa-f]{6}" placeholder="#E9785E" onChange={(event) => { setColorKey(null); setCustomColor(event.target.value) }} />
                    </label>
                    <div className="member-color-live-preview" style={{ ...memberColorStyle(summaryMember), backgroundColor: 'var(--member-soft)', borderColor: 'var(--member-border)' }}>
                      <MemberAvatar member={summaryMember} size={34} />
                      <span className="member-badge">{summaryMember.display_name}</span>
                      <span className="member-preview-row">{t.family.customColorPreview}</span>
                    </div>
                    {customColor && !normalizedCustomColor && <p className="error" role="alert">{t.family.errors.customColorInvalid}</p>}
                  </div>
                )}
              </fieldset>

              <fieldset className="member-editor-block profile-fieldset">
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

              {createRecord && (currentMember.role === 'admin' || currentMember.role === 'parent') && (
                <section className="member-editor-block member-planning-shortcuts" aria-labelledby="member-planning-title">
                  <h4 id="member-planning-title">{t.family.editor.planForMember(member.display_name)}</h4>
                  <div className="member-planning-actions">
                    <button type="button" className="btn-secondary" onClick={() => openForMember('household-task')}>+ {t.family.editor.planTask}</button>
                    <button type="button" className="btn-secondary" onClick={() => openForMember('activity')}>+ {t.family.editor.planActivity}</button>
                    <button type="button" className="btn-secondary" onClick={() => openForMember('medical')}>+ {t.family.editor.planMedical}</button>
                  </div>
                </section>
              )}
            </form>
          )}

          {activeSection === 'allowance' && showAllowance && (
            <AllowanceSection child={member} />
          )}

          {activeSection === 'access' && showAccountManagement && (
            <ChildAccountSection
              child={member}
              account={childAccount}
              onChanged={() => onAccountChanged?.()}
            />
          )}

          {activeSection === 'other' && showOther && (
            <section className="member-danger-zone" aria-labelledby="member-danger-zone-title">
              <h4 id="member-danger-zone-title">{t.family.dangerZone}</h4>
              <p className="field-hint">{t.family.editor.dangerZoneExplain}</p>
              {onRequestRemove && (
                <div className="member-danger-action">
                  <button type="button" className="btn-danger" disabled={saving} onClick={onRequestRemove}>{t.family.removeMemberAction}</button>
                  <p className="field-hint">{t.family.editor.removeMemberHint}</p>
                </div>
              )}
              {onRequestLeave && (
                <div className="member-danger-action">
                  <button type="button" className="btn-danger" disabled={saving} onClick={onRequestLeave}>{t.family.leaveHouseholdAction}</button>
                  <p className="field-hint">{t.family.editor.leaveHouseholdHint}</p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <div className="member-editor-footer">
        {error && <p className="error" role="alert">{error}</p>}
        <button
          type={activeSection === 'profile' ? 'submit' : 'button'}
          form={activeSection === 'profile' ? FORM_ID : undefined}
          disabled={saving}
          onClick={activeSection === 'profile' ? undefined : () => void handleSubmit()}
        >
          {saving ? t.family.savingProfile : t.family.saveProfile}
        </button>
      </div>

      <ConfirmDestructiveActionDialog
        open={confirmingDiscard}
        title={t.family.editor.discardTitle}
        explanation={t.family.editor.discardExplain}
        confirmLabel={t.family.editor.discardConfirm}
        onCancel={() => {
          setConfirmingDiscard(false)
          setPendingCreateType(null)
        }}
        onConfirm={() => {
          setConfirmingDiscard(false)
          onClose()
          if (pendingCreateType && createRecord) {
            createRecord.openCreateRecord({ type: pendingCreateType, memberId: member.id, source: 'member-profile' })
            setPendingCreateType(null)
          }
        }}
      />
    </Modal>
  )
}
