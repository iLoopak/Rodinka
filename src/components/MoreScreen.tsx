import { useState } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { supabase } from '../supabaseClient'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { Modal } from './ui/Modal'
import { SetPasswordForm } from './SetPasswordForm'
import { Link } from '../router'
import { FamilyMark } from './FamilyMark'
import { useActiveFamilyMark } from '../hooks/useActiveFamilyMark'
import { useLanguage } from '../i18n/languageContext'

export function MoreScreen() {
  const { currentMember, userEmail, familyName } = useFamilyData()
  const familyMark = useActiveFamilyMark()
  const { language, changeLanguage } = useLanguage()
  const [showSetPassword, setShowSetPassword] = useState(false)
  const { canPrompt, showIOSInstructions, isStandalone, isNative, promptInstall } = useInstallPrompt()

  return (
    <>
      <div className="home-header">
        <h1 className="home-title">{t.more.title}</h1>
      </div>

      <section className="section">
        <ul className="section-list plain-list">
          <li>
            <span className="row-meta">{t.more.signedInAs}</span>
            <span className="row-spacer" />
            <span className="row-title">{currentMember.display_name}</span>
          </li>
          <li>
            <span className="row-meta">{userEmail}</span>
          </li>
          <li className="family-settings-brand-row">
            <FamilyMark variant="dynamic" members={familyMark.members} size={32} loading={familyMark.loading} />
            <span className="row-meta">{t.more.familyLabel}</span>
            <span className="row-spacer" />
            <span className="row-title">{familyName ?? '—'}</span>
          </li>
          <li className="language-setting-row">
            <label htmlFor="app-language">
              <span className="row-title">{t.more.languageLabel}</span>
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
        <div className="family-actions">
          <button className="btn-secondary" onClick={() => setShowSetPassword(true)}>
            {t.more.setPasswordAction}
          </button>
          {!isNative && canPrompt && (
            <button className="btn-secondary" onClick={promptInstall}>
              {t.install.moreAction}
            </button>
          )}
        </div>
      </section>

      {showSetPassword && (
        <Modal title={t.more.setPasswordTitle} onClose={() => setShowSetPassword(false)}>
          <SetPasswordForm onDone={() => setShowSetPassword(false)} />
        </Modal>
      )}

      <section className="section">
        <ul className="section-list plain-list">
          <li>
            <Link to="/reminders" hash="#settings" className="row-title">{t.more.remindersAction}</Link>
            <span className="row-spacer" />
            <span aria-hidden="true">›</span>
          </li>
        </ul>
      </section>

      <button className="btn-secondary sign-out-button" onClick={() => supabase.auth.signOut()}>
        {t.dashboard.signOut}
      </button>
    </>
  )
}
