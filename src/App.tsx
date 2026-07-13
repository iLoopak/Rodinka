import { useSession } from './hooks/useSession'
import { useFamily } from './hooks/useFamily'
import { LoginScreen } from './components/LoginScreen'
import { OnboardingScreen } from './components/OnboardingScreen'
import { supabase } from './supabaseClient'
import { t } from './strings'

export default function App() {
  const { session, loading: sessionLoading } = useSession()
  const { member, loading: familyLoading, refresh } = useFamily(session?.user.id)

  if (sessionLoading) {
    return <div className="loading">{t.loading.session}</div>
  }

  if (!session) {
    return <LoginScreen />
  }

  if (familyLoading) {
    return <div className="loading">{t.loading.family}</div>
  }

  if (!member) {
    return <OnboardingScreen onDone={refresh} />
  }

  // From here on, `member` tells us who's logged in and their role —
  // this is where Phase 1 (Chores + Allowance) will plug in.
  return (
    <div className="app-shell">
      <header>
        <h1>{t.appName}</h1>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          {t.dashboard.signOut}
        </button>
      </header>
      <main>
        <p>{t.dashboard.welcome(member.display_name, member.role)}</p>
        <p>{t.dashboard.placeholder}</p>
      </main>
    </div>
  )
}
