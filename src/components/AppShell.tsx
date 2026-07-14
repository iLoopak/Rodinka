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
import { useFamilyData } from '../context/FamilyDataContext'
import { FamilyBrand } from './FamilyBrand'
import { useActiveFamilyMark } from '../hooks/useActiveFamilyMark'

export function AppShell() {
  const { path } = useRouter()
  const { familyName, familyNameLoading } = useFamilyData()
  const familyMark = useActiveFamilyMark()

  return (
    <div className="app-shell">
      <header className="app-header">
        <FamilyBrand
          familyName={familyName}
          members={familyMark.members}
          loading={familyNameLoading}
          markLoading={familyMark.loading}
        />
        <ReminderBell />
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
