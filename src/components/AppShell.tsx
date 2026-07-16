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
import { ReminderBell } from './reminders/ReminderBell'
import { ReminderCenter } from './reminders/ReminderCenter'
import { useFamilySettings } from '../context/family/FamilySettingsContext'
import { FamilyBrand } from './FamilyBrand'
import { useActiveFamilyMark } from '../hooks/useActiveFamilyMark'
import { useRealtimeStatus } from '../hooks/useRealtimeStatus'
import { RealtimeStatusBadge } from './ui/RealtimeStatusBadge'
import { useShopping } from '../context/shopping/ShoppingContext'
import { t } from '../strings'

export function AppShell() {
  const { path } = useRouter()
  const { familyName, familyNameLoading } = useFamilySettings()
  const familyMark = useActiveFamilyMark()
  const realtimeStatus = useRealtimeStatus()
  const { shoppingSyncStatus } = useShopping()
  const shoppingOnlyOffline = shoppingSyncStatus === 'offline'
  const offlineBlocked = shoppingOnlyOffline && path !== '/shopping'

  return (
    <div className={`app-shell${path === '/' ? ' is-today' : ''}`}>
      <header className="app-header">
        <FamilyBrand
          familyName={path === '/' ? null : familyName}
          members={familyMark.members}
          loading={familyNameLoading}
          markLoading={familyMark.loading}
        />
        <div className="app-header-actions">
          <RealtimeStatusBadge status={realtimeStatus} />
          <ReminderBell />
        </div>
      </header>
      <InstallAppBanner />
      <main className="app-main">
        {offlineBlocked && <OfflineModuleState />}
        {!offlineBlocked && path === '/' && <TodayDashboard />}
        {!offlineBlocked && path === '/calendar' && <CalendarScreen />}
        {!offlineBlocked && path === '/plan' && <PlannerScreen />}
        {!offlineBlocked && path === '/chores' && <ChoresScreen />}
        {!offlineBlocked && path === '/activities' && <ActivitiesScreen />}
        {!offlineBlocked && path === '/health' && <HealthScreen />}
        {!offlineBlocked && path === '/meals' && <MealPlanScreen />}
        {path === '/shopping' && <ShoppingScreen />}
        {!offlineBlocked && path === '/family' && <FamilyScreen />}
        {!offlineBlocked && path === '/more' && <MoreScreen />}
        {!offlineBlocked && path === '/reminders' && <ReminderCenter />}
      </main>
      <BottomNavigation />
    </div>
  )
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
