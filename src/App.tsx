import { useSession } from './hooks/useSession'
import { useFamily } from './hooks/useFamily'
import { LoginScreen } from './components/LoginScreen'
import { OnboardingScreen } from './components/OnboardingScreen'
import { supabase } from './supabaseClient'

export default function App() {
  const { session, loading: sessionLoading } = useSession()
  const { member, loading: familyLoading, refresh } = useFamily(session?.user.id)

  if (sessionLoading) {
    return <div className="loading">Loading...</div>
  }

  if (!session) {
    return <LoginScreen />
  }

  if (familyLoading) {
    return <div className="loading">Loading your family...</div>
  }

  if (!member) {
    return <OnboardingScreen onDone={refresh} />
  }

  // From here on, `member` tells us who's logged in and their role —
  // this is where Phase 1 (Chores + Allowance) will plug in.
  return (
    <div className="app-shell">
      <header>
        <h1>Family Organizer</h1>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <p>Welcome, {member.display_name} ({member.role}).</p>
        <p>Family dashboard and modules go here next.</p>
      </main>
    </div>
  )
}
