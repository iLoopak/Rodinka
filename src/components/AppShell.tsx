import { useRoutePath, useRouterActions } from '../router'
import { BottomNavigation } from './BottomNavigation'
import { InstallAppBanner } from './InstallAppBanner'
import { ReminderBell } from './reminders/ReminderBell'
import { MessagesBell } from './messages/MessagesBell'
import { useFamilySettings } from '../context/family/FamilySettingsContext'
import { FamilyBrand } from './FamilyBrand'
import { useActiveFamilyMark } from '../hooks/useActiveFamilyMark'
import { useRealtimeStatus } from '../hooks/useRealtimeStatus'
import { RealtimeStatusBadge } from './ui/RealtimeStatusBadge'
import { FamilyValidatingBadge } from './ui/FamilyValidatingBadge'
import { t } from '../strings'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { capabilitiesFor, childRouteFallback } from '../utils/uiCapabilities'
import { useActiveConversationId } from '../context/messages/MessagesSummaryContext'
import { useConversationPushBridge } from '../hooks/useConversationPushBridge'
import { CreateRecordWizardController } from './create-record/CreateRecordWizardController'
import { useConnectivityState } from '../network/connectivity'
import { useFamilyLogoAnimation } from '../hooks/useFamilyLogoAnimation'
import { useLanguage } from '../i18n/languageContext'
import { getRouteDefinition, type RouteDefinition } from '../routes/routeRegistry'
import { RouteRenderer } from '../routes/RouteRenderer'

export function AppShell() {
  const path = useRoutePath()
  const definition = getRouteDefinition(path)

  return <AppRouteOutlet definition={definition} />
}

export function AppRouteOutlet({ definition }: { definition: RouteDefinition }) {
  if (definition.shell === 'fullscreen') return <RouteRenderer definition={definition} />

  return <StandardAppShell definition={definition} />
}

function StandardAppShell({ definition }: { definition: RouteDefinition }) {
  const path = useRoutePath()
  const { navigate } = useRouterActions()
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
  // One connectivity answer instead of three hand-combined booleans. It also
  // subscribes, where the old inline browser-online read only updated when the
  // shell happened to re-render for some other reason.
  const connectivity = useConnectivityState()
  const logoAnimationMode = useFamilyLogoAnimation({
    baseMode: 'member-focus',
    connectionInterrupted: connectivity !== 'online',
    connectionReady: connectivity === 'online',
  })
  // Only a genuinely offline device may hide an offline-incapable route. A
  // degraded backend — or one feature's stuck queue — must not black out
  // unrelated screens (audit P1-7).
  const offlineBlocked = connectivity === 'offline' && definition.offline === 'blocked'
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
          <FamilyValidatingBadge />
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
  const { navigate } = useRouterActions()
  return <section className="empty-state offline-module-state">
    <p className="eyebrow">{t.offline.statusLabel}</p>
    <h1>{t.offline.moduleTitle}</h1>
    <p>{t.offline.moduleBody}</p>
    <button type="button" onClick={() => navigate('/shopping')}>{t.offline.backToShopping}</button>
  </section>
}
