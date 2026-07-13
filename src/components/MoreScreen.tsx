import { useState } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { supabase } from '../supabaseClient'
import { Modal } from './ui/Modal'
import { SetPasswordForm } from './SetPasswordForm'

export function MoreScreen() {
  const { currentMember, userEmail, familyName } = useFamilyData()
  const [showSetPassword, setShowSetPassword] = useState(false)

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
        </ul>
        <button className="btn-secondary" onClick={() => setShowSetPassword(true)}>
          {t.more.setPasswordAction}
        </button>
      </section>

      {showSetPassword && (
        <Modal title={t.more.setPasswordTitle} onClose={() => setShowSetPassword(false)}>
          <SetPasswordForm onDone={() => setShowSetPassword(false)} />
        </Modal>
      )}

      <section className="section">
        <ul className="section-list plain-list">
          <li className="disabled-row">
            <span className="row-title">{t.more.placeholderActivities}</span>
            <span className="row-spacer" />
            <span className="badge badge-pending">{t.more.comingSoonBadge}</span>
          </li>
          <li className="disabled-row">
            <span className="row-title">{t.more.placeholderCalendar}</span>
            <span className="row-spacer" />
            <span className="badge badge-pending">{t.more.comingSoonBadge}</span>
          </li>
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
