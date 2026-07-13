import { useSession } from './hooks/useSession'
import { useFamily } from './hooks/useFamily'
import { LoginScreen } from './components/LoginScreen'
import { OnboardingScreen } from './components/OnboardingScreen'
import { AppShell } from './components/AppShell'
import { RouterProvider } from './router'
import { FamilyDataProvider } from './context/FamilyDataContext'
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
    <RouterProvider>
      <FamilyDataProvider member={member} userId={session.user.id} userEmail={session.user.email ?? ''}>
        <AppShell />
      </FamilyDataProvider>
    </RouterProvider>
  )
}
