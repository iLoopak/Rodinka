import { useSession } from './hooks/useSession'
import { useFamily } from './hooks/useFamily'
import { LoginScreen } from './components/LoginScreen'
import { OnboardingScreen } from './components/OnboardingScreen'
import { ChoresDashboard } from './components/ChoresDashboard'
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
        <ChoresDashboard familyId={member.family_id} userId={session.user.id} />
      </main>
    </div>
  )
}
