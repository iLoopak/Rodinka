import { useSession } from './hooks/useSession'
import { useFamily } from './hooks/useFamily'
import { AuthScreen } from './components/AuthScreen'
import { OnboardingScreen } from './components/OnboardingScreen'
import { AppShell } from './components/AppShell'
import { RouterProvider } from './router'
import { FamilyDataProvider } from './context/FamilyDataContext'
import { ReminderProvider } from './context/ReminderContext'
import { t } from './strings'

export default function App() {
  const { session, loading: sessionLoading } = useSession()
  const { member, loading: familyLoading, refresh } = useFamily(session?.user.id)

  if (sessionLoading) {
    return <div className="loading">{t.loading.session}</div>
  }

  if (!session) {
    return <AuthScreen />
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
        <ReminderProvider>
          <AppShell />
        </ReminderProvider>
      </FamilyDataProvider>
    </RouterProvider>
  )
}
