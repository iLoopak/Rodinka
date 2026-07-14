import { useRouter } from '../router'
import { t } from '../strings'
import { Logo } from './Logo'
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

export function AppShell() {
  const { path } = useRouter()

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <Logo size={28} />
          <span className="wordmark">{t.appName}</span>
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
      </main>
      <BottomNavigation />
    </div>
  )
}
