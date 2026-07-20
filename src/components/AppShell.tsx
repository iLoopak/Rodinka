import { useRouter } from '../router'
import { BottomNavigation } from './BottomNavigation'
import { InstallAppBanner } from './InstallAppBanner'
import { ReminderBell } from './reminders/ReminderBell'
import { MessagesBell } from './messages/MessagesBell'
import { useFamilySettings } from '../context/family/FamilySettingsContext'
import { FamilyBrand } from './FamilyBrand'
import { useActiveFamilyMark } from '../hooks/useActiveFamilyMark'
import { useRealtimeStatus } from '../hooks/useRealtimeStatus'
import { RealtimeStatusBadge } from './ui/RealtimeStatusBadge'
import { useShoppingSyncStatus } from '../context/shopping/ShoppingContext'
import { t } from '../strings'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { capabilitiesFor, childRouteFallback } from '../utils/uiCapabilities'
import { useActiveConversationId } from '../context/messages/MessagesContext'
import { useConversationPushBridge } from '../hooks/useConversationPushBridge'
import { CreateRecordWizardController } from './create-record/CreateRecordWizardController'
import { useCalendarSyncStatus } from '../context/calendar/CalendarOfflineContext'
import { useFamilyLogoAnimation } from '../hooks/useFamilyLogoAnimation'
import { useLanguage } from '../i18n/languageContext'
import { getRouteDefinition, type RouteDefinition } from '../routes/routeRegistry'
import { RouteRenderer } from '../routes/RouteRenderer'

export function AppShell() {
  const { path } = useRouter()
  const definition = getRouteDefinition(path)

  return <AppRouteOutlet definition={definition} />
}

export function AppRouteOutlet({ definition }: { definition: RouteDefinition }) {
  if (definition.shell === 'fullscreen') return <RouteRenderer definition={definition} />

  return <StandardAppShell definition={definition} />
}

function StandardAppShell({ definition }: { definition: RouteDefinition }) {
  const { path, navigate } = useRouter()
  const { language } = useLanguage()
  const { currentMember } = useFamilyCore()
  const activeConversationId = useActiveConversationId()
  // Mounted here rather than inside MessagesScreen so the service worker's
  // "is this conversation open?" probe gets an immediate answer from any
  // screen, and so a push click can route in from anywhere in the app.
  useConversationPushBridge(activeConversationId)
  const capabilities = capabilitiesFor(currentMember)
  const { familyName, familyNameLoading } = useFamilySettings()
  const familyMark = useActiveFamilyMark()
  const realtimeStatus = useRealtimeStatus()
  const shoppingSyncStatus = useShoppingSyncStatus()
  const calendarSyncStatus = useCalendarSyncStatus()
  const offlineMode = shoppingSyncStatus === 'offline' || calendarSyncStatus === 'offline'
  const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine
  const realtimeInterrupted = realtimeStatus === 'reconnecting' || realtimeStatus === 'disconnected'
  const logoAnimationMode = useFamilyLogoAnimation({
    baseMode: 'member-focus',
    connectionInterrupted: browserOffline || offlineMode || realtimeInterrupted,
    connectionReady: !browserOffline && !offlineMode && realtimeStatus === 'connected',
  })
  const offlineBlocked = offlineMode && definition.offline === 'blocked'
  const routeAllowed = capabilities.accessRoute(path)

  return (
    <div className={`app-shell${path === '/' ? ' is-today' : ''}`}>
      <header className="app-header">
        <FamilyBrand
          familyName={familyName}
          members={familyMark.members}
          activeMemberId={currentMember.id}
          animationMode={logoAnimationMode}
          loading={familyNameLoading}
          markLoading={familyMark.loading}
          onOpenGame={() => navigate('/family-jump')}
          openGameLabel={language === 'cs' ? 'Otevřít Rodinnou hernu' : 'Open the family arcade'}
        />
        <div className="app-header-actions">
          <RealtimeStatusBadge status={realtimeStatus} />
          <MessagesBell />
          <ReminderBell />
        </div>
      </header>
      <InstallAppBanner />
      <main className="app-main">
        {offlineBlocked && <OfflineModuleState />}
        {!offlineBlocked && !routeAllowed && <RestrictedChildRoute onContinue={() => navigate(childRouteFallback(path))} />}
        {!offlineBlocked && routeAllowed && <RouteRenderer definition={definition} />}
      </main>
      <BottomNavigation />
      <CreateRecordWizardController />
    </div>
  )
}

function RestrictedChildRoute({ onContinue }: { onContinue: () => void }) {
  return <section className="empty-state restricted-child-route">
    <h1>{t.childShell.restrictedTitle}</h1>
    <p>{t.childShell.restrictedBody}</p>
    <button type="button" onClick={onContinue}>{t.childShell.restrictedAction}</button>
  </section>
}

function OfflineModuleState() {
  const { navigate } = useRouter()
  return <section className="empty-state offline-module-state">
    <p className="eyebrow">{t.offline.statusLabel}</p>
    <h1>{t.offline.moduleTitle}</h1>
    <p>{t.offline.moduleBody}</p>
    <button type="button" onClick={() => navigate('/shopping')}>{t.offline.backToShopping}</button>
  </section>
}
