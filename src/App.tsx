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
import { useCalendarOffline } from './context/calendar/CalendarOfflineContext'
import { resolveAuthRoutingState } from './auth/authRoutingState'

function AppLoading({ label }: { label: string }) {
  return <div className="loading app-loading"><FamilyMark variant="static" size={32} />{label}</div>
}

export default function App() {
  useLanguage()
  const { session } = useSession()
  const family = useFamily(session?.user.id)
  const routing = resolveAuthRoutingState({ session, family })

  if (routing.status === 'authLoading') {
    return <AppLoading label={t.loading.session} />
  }

  if (routing.status === 'unauthenticated') {
    return <AuthScreen />
  }

  if (routing.status === 'userDataLoading') {
    return <AppLoading label={t.loading.family} />
  }

  if (routing.status === 'userDataError') {
    return <OfflineFallbackScreen
      canOpenShopping={false}
      canOpenCalendar={false}
      deviceOffline={typeof navigator !== 'undefined' && !navigator.onLine}
      onOpenShopping={() => { window.history.pushState(null, '', '/shopping') }}
      onOpenCalendar={() => { window.history.pushState(null, '', '/calendar') }}
      onRetry={family.refresh}
    />
  }

  if (routing.status === 'authenticatedWithoutFamily') {
    if (isManagedChildSession(routing.session)) return <UnlinkedChildAccountScreen />
    return <OnboardingScreen onDone={family.refresh} />
  }

  return (
    <RouterProvider>
      <AppDataProviders member={routing.member} userId={routing.session.user.id} userEmail={routing.session.user.email ?? ''}>
        <ReminderProvider>
          <PushProvider>
            <CreateRecordProvider>
              <OfflineStartupGate connectionError={routing.connectionError} refresh={family.refresh}>
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
  const { calendarHasUsableData } = useCalendarOffline()
  const showFallback = Boolean(connectionError) && path !== '/shopping' && path !== '/calendar'
  if (showFallback) {
    return <OfflineFallbackScreen
      canOpenShopping
      canOpenCalendar={calendarHasUsableData}
      deviceOffline={typeof navigator !== 'undefined' && !navigator.onLine}
      onOpenShopping={() => navigate('/shopping')}
      onOpenCalendar={() => navigate('/calendar')}
      onRetry={refresh}
    />
  }
  return <>{children}</>
}
