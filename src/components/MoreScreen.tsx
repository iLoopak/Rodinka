import { useState } from 'react'
import { t } from '../strings'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { useFamilySettings } from '../context/family/FamilySettingsContext'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { Modal } from './ui/Modal'
import { SetPasswordForm } from './SetPasswordForm'
import { ChangeEmailForm } from './ChangeEmailForm'
import { useAuthAccount } from '../hooks/useAuthAccount'
import { landedFromEmailChangeConfirmation } from '../lib/emailChange'
import { Link } from '../router'
import { FamilyMark } from './FamilyMark'
import { useActiveFamilyMark } from '../hooks/useActiveFamilyMark'
import { useLanguage } from '../i18n/languageContext'
import { FamilyHeroCropEditor } from './family/FamilyHeroCropEditor'
import { validateFamilyHeroFile } from '../utils/familyHeroImage'
import { ScreenHeader } from './ui/ScreenHeader'
import { ConfirmDestructiveActionDialog } from './ui/DestructiveActions'
import { capabilitiesFor } from '../utils/uiCapabilities'
import { internalEmailToChildLoginName } from '../lib/childAccountIdentity'
import { useFamilyMembersData } from '../context/family/FamilyMembersContext'
import { MemberProfileModal } from './family/MemberProfileModal'
import { FamilyAllowanceSettings } from './allowance/FamilyAllowanceSettings'
import { AllowancePlanDialog } from './allowance/AllowancePlanDialog'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { useCalendarOffline } from '../context/calendar/CalendarOfflineContext'
import { signOutCurrentAccount } from '../auth/signOutCurrentAccount'

export function MoreScreen() {
  const { currentMember, userEmail, userId } = useFamilyCore()
  const capabilities = capabilitiesFor(currentMember)
  const { members, refreshMembers } = useFamilyMembersData()
  const { familyName, familyHeroImageUrl, updateFamilyName, updateFamilyHeroImage } = useFamilySettings()
  const familyMark = useActiveFamilyMark()
  const { language, changeLanguage } = useLanguage()
  const { account, refresh: refreshAccount } = useAuthAccount()
  const [showSetPassword, setShowSetPassword] = useState(false)
  const [showChangeEmail, setShowChangeEmail] = useState(false)
  // Only meaningful on the render right after the confirmation redirect; the
  // banner disappears on the next navigation, which is the intent.
  const [emailChangeConfirmed] = useState(landedFromEmailChangeConfirmation)
  const [editingFamilyName, setEditingFamilyName] = useState(false)
  const [familyNameDraft, setFamilyNameDraft] = useState('')
  const [familyNameSaving, setFamilyNameSaving] = useState(false)
  const [familyNameSaveError, setFamilyNameSaveError] = useState<string | null>(null)
  const [familyPhotoSource, setFamilyPhotoSource] = useState<File | null>(null)
  const [familyPhotoBusy, setFamilyPhotoBusy] = useState(false)
  const [familyPhotoFeedback, setFamilyPhotoFeedback] = useState<string | null>(null)
  const [familyPhotoError, setFamilyPhotoError] = useState<string | null>(null)
  const [confirmPhotoRemoval, setConfirmPhotoRemoval] = useState(false)
  const [editingOwnProfile, setEditingOwnProfile] = useState(false)
  const [allowanceChild, setAllowanceChild] = useState<FamilyMember | null>(null)
  const childMembers = members.filter((member) => member.role === 'child')
  const { canPrompt, showIOSInstructions, isStandalone, isNative, promptInstall } = useInstallPrompt()
  const { clearCalendarAccount } = useCalendarOffline()

  function startEditingFamilyName() {
    setFamilyNameDraft(familyName ?? '')
    setFamilyNameSaveError(null)
    setEditingFamilyName(true)
  }

  async function saveFamilyName(event: React.FormEvent) {
    event.preventDefault()
    if (!familyNameDraft.trim()) return
    setFamilyNameSaving(true)
    setFamilyNameSaveError(null)
    try {
      await updateFamilyName(familyNameDraft)
      setEditingFamilyName(false)
    } catch {
      setFamilyNameSaveError(t.family.errors.familyNameSaveFailed)
    } finally {
      setFamilyNameSaving(false)
    }
  }

  function chooseFamilyPhoto(file: File | undefined) {
    if (!file) return
    setFamilyPhotoFeedback(null)
    if (validateFamilyHeroFile(file)) {
      setFamilyPhotoError(t.more.familyPhotoInvalid)
      return
    }
    setFamilyPhotoError(null)
    setFamilyPhotoSource(file)
  }

  async function saveFamilyPhoto(file: File) {
    setFamilyPhotoSource(null)
    setFamilyPhotoBusy(true)
    setFamilyPhotoError(null)
    try {
      await updateFamilyHeroImage(file)
      setFamilyPhotoFeedback(t.more.familyPhotoSaved)
    } catch {
      setFamilyPhotoError(t.more.familyPhotoSaveFailed)
    } finally {
      setFamilyPhotoBusy(false)
    }
  }

  async function removeFamilyPhoto() {
    setFamilyPhotoBusy(true)
    setFamilyPhotoError(null)
    setFamilyPhotoFeedback(null)
    try {
      await updateFamilyHeroImage(null)
      setFamilyPhotoFeedback(t.more.familyPhotoRemoved)
      setConfirmPhotoRemoval(false)
    } catch {
      setFamilyPhotoError(t.more.familyPhotoSaveFailed)
    } finally {
      setFamilyPhotoBusy(false)
    }
  }

  return (
    <>
      <ScreenHeader title={t.more.title} />

      <section className="page-section">
        <div className="panel is-primary more-settings-section">
        <ul className="section-list plain-list more-settings-list">
          <li className="more-settings-group-heading"><h2>{t.more.accountSection}</h2></li>
          <li className="more-settings-row account-email-row">
            <span className="more-setting-copy">
              <span className="more-setting-label">{t.more.signedInAs}</span>
              <strong className="more-setting-value">{currentMember.display_name}</strong>
              {capabilities.isChild ? (
                <span className="more-setting-detail">
                  {`${t.more.childLoginLabel}: ${internalEmailToChildLoginName(userEmail) ?? t.more.childLoginUnavailable}`}
                </span>
              ) : (
                <span className="account-email-status">
                  {/* Prefer the live auth user; fall back to the session email
                      captured at login only while getUser is still in flight. */}
                  <span className="more-setting-detail">{account.email || userEmail}</span>
                  {account.pendingEmail
                    ? <span className="badge badge-pending">{t.more.emailPendingBadge}</span>
                    : account.emailVerified
                      ? <span className="badge badge-done">{t.more.emailVerifiedBadge}</span>
                      : <span className="badge badge-neutral">{t.more.emailUnverifiedBadge}</span>}
                </span>
              )}
            </span>
            {account.canChangeEmail && !capabilities.isChild && (
              <button
                type="button"
                className="btn-link account-email-edit"
                onClick={() => setShowChangeEmail(true)}
              >
                {t.more.changeEmailAction}
              </button>
            )}
            {account.pendingEmail && (
              <p className="more-setting-feedback account-email-note" role="status">
                {t.more.emailPendingDetail(account.pendingEmail)}
              </p>
            )}
            {emailChangeConfirmed && !account.pendingEmail && (
              <p className="success more-setting-feedback account-email-note" role="status">
                {t.more.changeEmailConfirmed}
              </p>
            )}
          </li>
          {capabilities.isChild && <li className="more-settings-row">
            <button type="button" className="btn-secondary" onClick={() => setEditingOwnProfile(true)}>{t.more.editMyProfile}</button>
          </li>}
          {!capabilities.isChild && <><li className="more-settings-group-heading"><h2>{t.more.familySection}</h2></li>
          <li className="family-settings-brand-row more-settings-row">
            <FamilyMark variant="dynamic" members={familyMark.members} size={32} loading={familyMark.loading} />
            {editingFamilyName ? (
              <form className="more-family-name-form" onSubmit={saveFamilyName}>
                <label className="visually-hidden" htmlFor="more-family-name">{t.family.familyNameLabel}</label>
                <input
                  id="more-family-name"
                  value={familyNameDraft}
                  onChange={(event) => setFamilyNameDraft(event.target.value)}
                  disabled={familyNameSaving}
                  required
                />
                <div className="more-family-name-actions">
                  <button type="submit" disabled={familyNameSaving || !familyNameDraft.trim()}>
                    {familyNameSaving ? t.family.savingFamilyName : t.family.saveFamilyName}
                  </button>
                  <button type="button" className="btn-secondary" disabled={familyNameSaving} onClick={() => setEditingFamilyName(false)}>
                    {t.common.close}
                  </button>
                </div>
                {familyNameSaveError && <p className="error" role="alert">{familyNameSaveError}</p>}
              </form>
            ) : <>
              <span className="more-setting-copy">
                <span className="more-setting-label">{t.more.familyLabel}</span>
                <strong className="more-setting-value">{familyName ?? '—'}</strong>
              </span>
              {currentMember.role === 'admin' && (
                <button type="button" className="btn-link more-family-name-edit" onClick={startEditingFamilyName}>
                  {t.family.editFamilyName}
                </button>
              )}
            </>}
          </li>
          {currentMember.role === 'admin' && <li className="more-settings-row family-photo-setting-row">
            <span className={`family-photo-setting-preview${familyHeroImageUrl ? ' has-photo' : ''}`} aria-hidden="true">
              {familyHeroImageUrl
                ? <img src={familyHeroImageUrl} alt="" />
                : <FamilyMark variant="dynamic" members={familyMark.members} size={38} loading={familyMark.loading} />}
            </span>
            <span className="more-setting-copy">
              <span className="more-setting-value">{t.more.familyPhotoLabel}</span>
              <small>{t.more.familyPhotoHelp}</small>
            </span>
            <span className="family-photo-setting-actions">
              <label className="btn-secondary family-photo-picker">
                {familyPhotoBusy ? t.more.familyPhotoSaving : familyHeroImageUrl ? t.more.familyPhotoChange : t.more.familyPhotoChoose}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={familyPhotoBusy}
                  onChange={(event) => {
                    chooseFamilyPhoto(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
              {familyHeroImageUrl && <button type="button" className="btn-link destructive-link" disabled={familyPhotoBusy} onClick={() => setConfirmPhotoRemoval(true)}>
                {familyPhotoBusy ? t.more.familyPhotoRemoving : t.more.familyPhotoRemove}
              </button>}
            </span>
            {familyPhotoFeedback && <p className="more-setting-feedback" role="status">{familyPhotoFeedback}</p>}
            {familyPhotoError && <p className="error more-setting-feedback" role="alert">{familyPhotoError}</p>}
          </li>}
          {/* Only parents and admins reach this branch at all, which matches
              the is_family_parent check behind every allowance write. */}
          <li className="more-settings-group-heading"><h2>{t.allowance.familySectionTitle}</h2></li>
          <FamilyAllowanceSettings childMembers={childMembers} onEdit={setAllowanceChild} /></>}
          <li className="more-settings-group-heading"><h2>{t.more.appSection}</h2></li>
          <li className="language-setting-row more-settings-row">
            <label htmlFor="app-language">
              <span className="more-setting-value">{t.more.languageLabel}</span>
              <small>{t.more.languageHelp}</small>
            </label>
            <span className="row-spacer" />
            <select
              id="app-language"
              className="language-select"
              value={language}
              aria-label={t.more.languageLabel}
              onChange={(event) => void changeLanguage(event.target.value === 'cs' ? 'cs' : 'en')}
            >
              <option value="cs">Čeština</option>
              <option value="en">English</option>
            </select>
          </li>
          {!isNative && isStandalone && (
            <li>
              <span className="row-title">{t.install.moreAction}</span>
              <span className="row-spacer" />
              <span className="badge badge-done">{t.install.installedBadge}</span>
            </li>
          )}
          {!isNative && showIOSInstructions && (
            <li>
              <span className="row-title">{t.install.iosTitle}</span>
              <p className="row-description">{t.install.iosBody}</p>
            </li>
          )}
        </ul>
        <div className="family-actions more-settings-actions">
          <button className="btn-secondary" onClick={() => setShowSetPassword(true)}>
            {t.more.setPasswordAction}
          </button>
          {!isNative && canPrompt && (
            <button className="btn-secondary" onClick={promptInstall}>
              {t.install.moreAction}
            </button>
          )}
        </div>
        </div>
      </section>

      {showSetPassword && (
        <Modal title={t.more.setPasswordTitle} onClose={() => setShowSetPassword(false)}>
          <SetPasswordForm onDone={() => setShowSetPassword(false)} />
        </Modal>
      )}

      {showChangeEmail && (
        <Modal title={t.more.changeEmailTitle} onClose={() => setShowChangeEmail(false)}>
          <ChangeEmailForm
            currentEmail={account.email || userEmail}
            hasGoogleIdentity={account.hasGoogleIdentity}
            onSubmitted={() => void refreshAccount()}
            onDone={() => setShowChangeEmail(false)}
          />
        </Modal>
      )}

      {editingOwnProfile && <MemberProfileModal
        key={currentMember.id}
        member={currentMember}
        currentMember={currentMember}
        refreshMembers={refreshMembers}
        onClose={() => setEditingOwnProfile(false)}
      />}

      {allowanceChild && <AllowancePlanDialog
        key={allowanceChild.id}
        child={allowanceChild}
        onClose={() => setAllowanceChild(null)}
      />}

      {familyPhotoSource && <FamilyHeroCropEditor
        file={familyPhotoSource}
        onApply={(file) => void saveFamilyPhoto(file)}
        onCancel={() => setFamilyPhotoSource(null)}
        onError={() => setFamilyPhotoError(t.more.familyPhotoInvalid)}
      />}

      <ConfirmDestructiveActionDialog
        open={confirmPhotoRemoval}
        title={t.more.familyPhotoRemoveConfirm}
        explanation={t.more.familyPhotoRemoveExplain}
        confirmLabel={t.more.familyPhotoRemove}
        busy={familyPhotoBusy}
        error={familyPhotoError}
        onCancel={() => setConfirmPhotoRemoval(false)}
        onConfirm={removeFamilyPhoto}
      />

      <section className="page-section">
        <div className="panel is-primary more-links-section">
          <ul className="section-list plain-list more-settings-list">
            <li>
              <Link to="/arcade" className="row-link more-navigation-row">
                <span className="row-title">{language === 'cs' ? 'Rodinná herna' : 'Family arcade'}</span>
                <span className="more-navigation-chevron" aria-hidden="true">›</span>
              </Link>
            </li>
            {capabilities.isChild && <>
              <li className="more-settings-group-heading"><h2>{t.more.childLinksSection}</h2></li>
              <li><Link to="/activities" className="row-link more-navigation-row"><span className="row-title">{t.more.activitiesAction}</span><span className="more-navigation-chevron" aria-hidden="true">›</span></Link></li>
              <li><Link to="/meals" className="row-link more-navigation-row"><span className="row-title">{t.more.mealsAction}</span><span className="more-navigation-chevron" aria-hidden="true">›</span></Link></li>
              <li><Link to="/chores" hash="#allowance" className="row-link more-navigation-row"><span className="row-title">{t.more.allowanceAction}</span><span className="more-navigation-chevron" aria-hidden="true">›</span></Link></li>
            </>}
            <li>
              <Link to="/messages" className="row-link more-navigation-row">
                <span className="row-title">{t.more.messagesAction}</span>
                <span className="more-navigation-chevron" aria-hidden="true">›</span>
              </Link>
            </li>
            <li>
              <Link to="/reminders" hash="#settings" className="row-link more-navigation-row">
                <span className="row-title">{t.more.remindersAction}</span>
                <span className="more-navigation-chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          </ul>
        </div>
      </section>

      <button
        className="btn-secondary sign-out-button"
        onClick={async () => {
          try {
            await signOutCurrentAccount({ userId, clearCalendarAccount })
          } catch (error) {
            console.error('Failed to sign out:', error instanceof Error ? error.message : 'unknown error')
          }
        }}
      >
        {t.dashboard.signOut}
      </button>
    </>
  )
}
