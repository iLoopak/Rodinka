import { useEffect, useRef, useState } from 'react'
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
import { useNetworkStatus } from './network/useNetworkStatus'
import { ErrorState } from './components/ui/ErrorState'
import { routeIsAvailableOffline } from './routes/routeRegistry'
import { FamilyBootstrapProvider } from './context/family/FamilyBootstrapContext'

function AppLoading({ label }: { label: string }) {
  return <div className="loading app-loading"><FamilyMark variant="static" size={32} />{label}</div>
}

export default function App() {
  useLanguage()
  const networkStatus = useNetworkStatus()
  const { session, status: authStatus, authError, retry: retryAuth } = useSession()
  const family = useFamily(session?.user.id)
  const routing = resolveAuthRoutingState({ session, authStatus, authError, family })
  const lastRoutingStatus = useRef<string | null>(null)
  // Escape hatch: if the auth check keeps failing, the user must still be able
  // to reach the login form rather than being stuck behind a retry button.
  const [skipAuthError, setSkipAuthError] = useState(false)

  useEffect(() => {
    console.info('BOOT 6 offline check done', { networkStatus })
  }, [networkStatus])

  useEffect(() => {
    if (lastRoutingStatus.current === routing.status) return
    lastRoutingStatus.current = routing.status
    console.info('BOOT 7 routing', { status: routing.status })
    if (routing.status !== 'authLoading' && routing.status !== 'userDataLoading') {
      console.info('BOOT DONE', { status: routing.status })
    }
  }, [routing.status])

  if (routing.status === 'authLoading') {
    return <AppLoading label={t.loading.session} />
  }

  if (routing.status === 'authError' && !skipAuthError) {
    console.error('BOOT ERROR auth unavailable:', routing.authError)
    return (
      <div className="loading app-loading">
        <FamilyMark variant="static" size={32} />
        <ErrorState message={t.bootstrap.sessionUnavailable} onRetry={retryAuth} />
        <button type="button" className="link" onClick={() => setSkipAuthError(true)}>
          {t.bootstrap.continueToSignIn}
        </button>
      </div>
    )
  }

  if (routing.status === 'unauthenticated' || routing.status === 'authError') {
    return <AuthScreen />
  }

  if (routing.status === 'userDataLoading') {
    return <AppLoading label={t.loading.family} />
  }

  if (routing.status === 'userDataError') {
    if (networkStatus === 'offline') {
      return <OfflineFallbackScreen
        canOpenShopping={false}
        canOpenCalendar={false}
        deviceOffline
        onOpenShopping={() => { window.history.pushState(null, '', '/shopping') }}
        onOpenCalendar={() => { window.history.pushState(null, '', '/calendar') }}
        onRetry={family.refresh}
      />
    }
    console.error('BOOT ERROR routing failed:', routing.connectionError)
    return <ErrorState message={t.errors.loadFailed} onRetry={family.refresh} />
  }

  if (routing.status === 'authenticatedWithoutFamily') {
    if (isManagedChildSession(routing.session)) return <UnlinkedChildAccountScreen />
    return <OnboardingScreen onDone={family.refresh} />
  }

  const validating = routing.status === 'cachedFamilyValidating'
  const connectionError = routing.status === 'authenticatedWithFamily' ? routing.connectionError : null
  // Remount the whole data graph when the identity scope changes. Without this
  // key, switching account or family would reuse provider state that was
  // populated for the previous scope — the one thing a cached-identity boot
  // must never be able to show.
  const scopeKey = `${routing.session.user.id}:${routing.member.family_id}`

  return (
    <RouterProvider>
      <FamilyBootstrapProvider validating={validating}>
        <AppDataProviders key={scopeKey} member={routing.member} userId={routing.session.user.id} userEmail={routing.session.user.email ?? ''}>
          <ReminderProvider>
            <PushProvider>
              <CreateRecordProvider>
                <OfflineStartupGate networkStatus={networkStatus} connectionError={connectionError} refresh={family.refresh}>
                  <AppShell />
                </OfflineStartupGate>
              </CreateRecordProvider>
            </PushProvider>
          </ReminderProvider>
        </AppDataProviders>
      </FamilyBootstrapProvider>
    </RouterProvider>
  )
}

function OfflineStartupGate({ children, networkStatus, connectionError, refresh }: { children: ReactNode; networkStatus: ReturnType<typeof useNetworkStatus>; connectionError: string | null; refresh: () => Promise<void> }) {
  const { path, navigate } = useRouter()
  const { calendarHasUsableData } = useCalendarOffline()
  const showFallback = networkStatus === 'offline' && Boolean(connectionError) && !routeIsAvailableOffline(path)
  if (showFallback) {
    return <OfflineFallbackScreen
      canOpenShopping
      canOpenCalendar={calendarHasUsableData}
      deviceOffline={networkStatus === 'offline'}
      onOpenShopping={() => navigate('/shopping')}
      onOpenCalendar={() => navigate('/calendar')}
      onRetry={refresh}
    />
  }
  return <>{children}</>
}
