import { useSession } from './hooks/useSession'
import type { ReactNode } from 'react'
import { useFamily } from './hooks/useFamily'
import { AuthScreen } from './components/AuthScreen'
import { OnboardingScreen } from './components/OnboardingScreen'
import { AppShell } from './components/AppShell'
import { RouterProvider } from './router'
import { AppDataProviders } from './context/AppDataProviders'
import { ReminderProvider } from './context/ReminderContext'
import { PushProvider } from './context/PushContext'
import { t } from './strings'
import { FamilyMark } from './components/FamilyMark'
import { useLanguage } from './i18n/languageContext'
import { OfflineFallbackScreen } from './components/OfflineFallbackScreen'
import { useRouter } from './router'
import { isManagedChildSession } from './lib/managedChildSession'
import { UnlinkedChildAccountScreen } from './components/UnlinkedChildAccountScreen'
import { CreateRecordProvider } from './context/create-record/CreateRecordContext'

function AppLoading({ label }: { label: string }) {
  return <div className="loading app-loading"><FamilyMark variant="static" size={32} />{label}</div>
}

export default function App() {
  useLanguage()
  const { session, loading: sessionLoading } = useSession()
  const { member, loading: familyLoading, refresh, connectionError } = useFamily(session?.user.id)

  if (sessionLoading) {
    return <AppLoading label={t.loading.session} />
  }

  if (!session) {
    return <AuthScreen />
  }

  if (familyLoading) {
    return <AppLoading label={t.loading.family} />
  }

  if (!member && connectionError) {
    return <OfflineFallbackScreen
      canOpenShopping={false}
      deviceOffline={typeof navigator !== 'undefined' && !navigator.onLine}
      onOpenShopping={() => { window.history.pushState(null, '', '/shopping') }}
      onRetry={refresh}
    />
  }

  if (!member) {
    if (isManagedChildSession(session)) return <UnlinkedChildAccountScreen />
    return <OnboardingScreen onDone={refresh} />
  }

  return (
    <RouterProvider>
      <AppDataProviders member={member} userId={session.user.id} userEmail={session.user.email ?? ''}>
        <ReminderProvider>
          <PushProvider>
            <CreateRecordProvider>
              <OfflineStartupGate connectionError={connectionError} refresh={refresh}>
                <AppShell />
              </OfflineStartupGate>
            </CreateRecordProvider>
          </PushProvider>
        </ReminderProvider>
      </AppDataProviders>
    </RouterProvider>
  )
}

function OfflineStartupGate({ children, connectionError, refresh }: { children: ReactNode; connectionError: string | null; refresh: () => Promise<void> }) {
  const { path, navigate } = useRouter()
  const showFallback = Boolean(connectionError) && path !== '/shopping'
  if (showFallback) {
    return <OfflineFallbackScreen
      canOpenShopping
      deviceOffline={typeof navigator !== 'undefined' && !navigator.onLine}
      onOpenShopping={() => navigate('/shopping')}
      onRetry={refresh}
    />
  }
  return <>{children}</>
}
