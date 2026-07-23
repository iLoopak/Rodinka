import { supabase } from '../supabaseClient'
import { releasePushOnSignOut } from '../push/releaseOnSignOut'
import { t } from '../strings'
import { FamilyMark } from './FamilyMark'

export function UnlinkedChildAccountScreen() {
  return (
    <main className="auth-screen" aria-labelledby="child-access-title">
      <div className="brand-lockup">
        <FamilyMark variant="static" size={48} />
        <h1 id="child-access-title">{t.login.childAccessUnavailableTitle}</h1>
      </div>
      <p>{t.login.childAccessUnavailableBody}</p>
      <button
        type="button"
        onClick={() => void releasePushOnSignOut().then(() => supabase.auth.signOut())}
      >{t.dashboard.signOut}</button>
    </main>
  )
}
