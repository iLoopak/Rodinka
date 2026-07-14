import { useSession } from './hooks/useSession'
import { useFamily } from './hooks/useFamily'
import { AuthScreen } from './components/AuthScreen'
import { OnboardingScreen } from './components/OnboardingScreen'
import { AppShell } from './components/AppShell'
import { RouterProvider } from './router'
import { FamilyDataProvider } from './context/FamilyDataContext'
import { ReminderProvider } from './context/ReminderContext'
import { PushProvider } from './context/PushContext'
import { t } from './strings'
import { FamilyMark } from './components/FamilyMark'
import { useLanguage } from './i18n/languageContext'

function AppLoading({ label }: { label: string }) {
  return <div className="loading app-loading"><FamilyMark variant="static" size={32} />{label}</div>
}

export default function App() {
  useLanguage()
  const { session, loading: sessionLoading } = useSession()
  const { member, loading: familyLoading, refresh } = useFamily(session?.user.id)

  if (sessionLoading) {
    return <AppLoading label={t.loading.session} />
  }

  if (!session) {
    return <AuthScreen />
  }

  if (familyLoading) {
    return <AppLoading label={t.loading.family} />
  }

  if (!member) {
    return <OnboardingScreen onDone={refresh} />
  }

  return (
    <RouterProvider>
      <FamilyDataProvider member={member} userId={session.user.id} userEmail={session.user.email ?? ''}>
        <ReminderProvider>
          <PushProvider>
            <AppShell />
          </PushProvider>
        </ReminderProvider>
      </FamilyDataProvider>
    </RouterProvider>
  )
}
