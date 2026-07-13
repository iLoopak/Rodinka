import { useState } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { supabase } from '../supabaseClient'
import { Link } from '../router'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { Modal } from './ui/Modal'
import { SetPasswordForm } from './SetPasswordForm'

export function MoreScreen() {
  const { currentMember, userEmail, familyName } = useFamilyData()
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
          <li>
            <span className="row-meta">{t.more.familyLabel}</span>
            <span className="row-spacer" />
            <span className="row-title">{familyName ?? '—'}</span>
          </li>
          <li>
            <span className="row-meta">{t.more.languageLabel}</span>
            <span className="row-spacer" />
            <span className="row-title">{t.more.languageValue}</span>
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
        <h2>{t.more.sectionsTitle}</h2>
        <ul className="section-list plain-list">
          <li>
            <Link to="/activities" className="row-link">
              <span className="row-title">{t.nav.activities}</span>
              <span className="row-spacer" />
              <span aria-hidden="true">›</span>
            </Link>
          </li>
          <li>
            <Link to="/health" className="row-link">
              <span className="row-title">{t.nav.health}</span>
              <span className="row-spacer" />
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        </ul>
      </section>

      <section className="section">
        <ul className="section-list plain-list">
          <li className="disabled-row">
            <span className="row-title">{t.more.placeholderNotifications}</span>
            <span className="row-spacer" />
            <span className="badge badge-pending">{t.more.comingSoonBadge}</span>
          </li>
        </ul>
      </section>

      <button className="btn-secondary sign-out-button" onClick={() => supabase.auth.signOut()}>
        {t.dashboard.signOut}
      </button>
    </>
  )
}
