import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { supabase } from '../supabaseClient'

export function MoreScreen() {
  const { currentMember, userEmail, familyName } = useFamilyData()

  return (
    <>
      <div className="home-header">
        <h1 className="home-title">{t.more.title}</h1>
      </div>

      <section className="section accent-sky">
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
      </section>

      <section className="section accent-lavender">
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
