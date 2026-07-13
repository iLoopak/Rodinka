import { useRouter } from '../router'
import { t } from '../strings'
import { Logo } from './Logo'
import { BottomNavigation } from './BottomNavigation'
import { TodayDashboard } from './TodayDashboard'
import { ChoresScreen } from './ChoresScreen'
import { FamilyScreen } from './FamilyScreen'
import { MoreScreen } from './MoreScreen'

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
      <main className="app-main">
        {path === '/' && <TodayDashboard />}
        {path === '/chores' && <ChoresScreen />}
        {path === '/family' && <FamilyScreen />}
        {path === '/more' && <MoreScreen />}
      </main>
      <BottomNavigation />
    </div>
  )
}
