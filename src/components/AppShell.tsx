import { useRouter } from '../router'
import { BottomNavigation } from './BottomNavigation'
import { TodayDashboard } from './TodayDashboard'
import { ChoresScreen } from './ChoresScreen'
import { FamilyScreen } from './FamilyScreen'
import { MoreScreen } from './MoreScreen'
import { CalendarScreen } from './CalendarScreen'
import { PlannerScreen } from './PlannerScreen'
import { ActivitiesScreen } from './ActivitiesScreen'
import { HealthScreen } from './HealthScreen'
import { MealPlanScreen } from './meals/MealPlanScreen'
import { InstallAppBanner } from './InstallAppBanner'
import { ShoppingScreen } from './ShoppingScreen'
import { MessagesScreen } from './messages/MessagesScreen'
import { ReminderBell } from './reminders/ReminderBell'
import { ReminderCenter } from './reminders/ReminderCenter'
import { MessagesBell } from './messages/MessagesBell'
import { useFamilySettings } from '../context/family/FamilySettingsContext'
import { FamilyBrand } from './FamilyBrand'
import { useActiveFamilyMark } from '../hooks/useActiveFamilyMark'
import { useRealtimeStatus } from '../hooks/useRealtimeStatus'
import { RealtimeStatusBadge } from './ui/RealtimeStatusBadge'
import { useShopping } from '../context/shopping/ShoppingContext'
import { t } from '../strings'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { capabilitiesFor, childRouteFallback } from '../utils/uiCapabilities'
import { useMessagesData } from '../context/messages/MessagesContext'
import { useConversationPushBridge } from '../hooks/useConversationPushBridge'
import { CreateRecordWizard } from './create-record/CreateRecordWizard'
import { useCalendarOffline } from '../context/calendar/CalendarOfflineContext'
import { useFamilyLogoAnimation } from '../hooks/useFamilyLogoAnimation'
import { FamilyJumpScreen } from '../features/family-jump/components/FamilyJumpScreen'
import { useLanguage } from '../i18n/languageContext'

export function AppShell() {
  const { path, navigate } = useRouter()
  const { language } = useLanguage()
  const { currentMember } = useFamilyCore()
  const { activeConversationId } = useMessagesData()
  // Mounted here rather than inside MessagesScreen so the service worker's
  // "is this conversation open?" probe gets an immediate answer from any
  // screen, and so a push click can route in from anywhere in the app.
  useConversationPushBridge(activeConversationId)
  const capabilities = capabilitiesFor(currentMember)
  const { familyName, familyNameLoading } = useFamilySettings()
  const familyMark = useActiveFamilyMark()
  const realtimeStatus = useRealtimeStatus()
  const { shoppingSyncStatus } = useShopping()
  const { calendarSyncStatus } = useCalendarOffline()
  const offlineMode = shoppingSyncStatus === 'offline' || calendarSyncStatus === 'offline'
  const browserOffline = typeof navigator !== 'undefined' && !navigator.onLine
  const realtimeInterrupted = realtimeStatus === 'reconnecting' || realtimeStatus === 'disconnected'
  const logoAnimationMode = useFamilyLogoAnimation({
    baseMode: 'member-focus',
    connectionInterrupted: browserOffline || offlineMode || realtimeInterrupted,
    connectionReady: !browserOffline && !offlineMode && realtimeStatus === 'connected',
  })
  const offlineBlocked = offlineMode && path !== '/' && path !== '/shopping' && path !== '/calendar'
  const routeAllowed = capabilities.accessRoute(path)

  if (path === '/family-jump') return <FamilyJumpScreen />

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
        {!offlineBlocked && routeAllowed && path === '/' && <TodayDashboard />}
        {!offlineBlocked && routeAllowed && path === '/calendar' && <CalendarScreen />}
        {!offlineBlocked && routeAllowed && path === '/plan' && <PlannerScreen />}
        {!offlineBlocked && routeAllowed && path === '/chores' && <ChoresScreen />}
        {!offlineBlocked && routeAllowed && path === '/activities' && <ActivitiesScreen />}
        {!offlineBlocked && routeAllowed && path === '/health' && <HealthScreen />}
        {!offlineBlocked && routeAllowed && path === '/meals' && <MealPlanScreen />}
        {routeAllowed && path === '/shopping' && <ShoppingScreen />}
        {!offlineBlocked && routeAllowed && path === '/family' && <FamilyScreen />}
        {!offlineBlocked && routeAllowed && path === '/messages' && <MessagesScreen />}
        {!offlineBlocked && routeAllowed && path === '/more' && <MoreScreen />}
        {!offlineBlocked && routeAllowed && path === '/reminders' && <ReminderCenter />}
      </main>
      <BottomNavigation />
      <CreateRecordWizard />
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
