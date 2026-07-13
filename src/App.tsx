import { useSession } from './hooks/useSession'
import { useFamily } from './hooks/useFamily'
import { LoginScreen } from './components/LoginScreen'
import { OnboardingScreen } from './components/OnboardingScreen'
import { ChoresDashboard } from './components/ChoresDashboard'
import { Logo } from './components/Logo'
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
      <header className="app-header">
        <div className="brand">
          <Logo size={28} />
          <span className="wordmark">{t.appName}</span>
        </div>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          {t.dashboard.signOut}
        </button>
      </header>
      <main>
        <div className="home-header">
          <h1 className="home-title">{t.home.title}</h1>
          <p className="home-subtitle">{t.home.welcome(member.display_name)}</p>
        </div>
        <ChoresDashboard familyId={member.family_id} userId={session.user.id} />
      </main>
    </div>
  )
}
