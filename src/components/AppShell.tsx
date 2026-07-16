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

export function AppShell() {
  const { path } = useRouter()
  const { familyName, familyNameLoading } = useFamilySettings()
  const familyMark = useActiveFamilyMark()
  const realtimeStatus = useRealtimeStatus()

  return (
    <div className="app-shell">
      <header className="app-header">
        <FamilyBrand
          familyName={familyName}
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
        {path === '/' && <TodayDashboard />}
        {path === '/calendar' && <CalendarScreen />}
        {path === '/plan' && <PlannerScreen />}
        {path === '/chores' && <ChoresScreen />}
        {path === '/activities' && <ActivitiesScreen />}
        {path === '/health' && <HealthScreen />}
        {path === '/meals' && <MealPlanScreen />}
        {path === '/shopping' && <ShoppingScreen />}
        {path === '/family' && <FamilyScreen />}
        {path === '/more' && <MoreScreen />}
        {path === '/reminders' && <ReminderCenter />}
      </main>
      <BottomNavigation />
    </div>
  )
}
