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

export function AppShell() {
  const { path } = useRouter()
  const { familyId, familyName, familyNameLoading, currentMember, members, membersLoading } = useFamilyData()
  const scopedFamilyMembers = members.filter((member) => member.family_id === familyId)
  const activeFamilyMembers = scopedFamilyMembers.length > 0 ? scopedFamilyMembers : [currentMember]
  const familyMarkLoading = familyNameLoading || membersLoading

  return (
    <div className="app-shell">
      <header className="app-header">
        <FamilyBrand
          familyName={familyName}
          members={activeFamilyMembers}
          loading={familyNameLoading}
          markLoading={familyMarkLoading}
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
