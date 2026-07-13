import { useFamilyData } from '../context/FamilyDataContext'
import { t } from '../strings'
import { getChoreState } from '../utils/choreState'
import { formatDueDateLabel, todayISODate } from '../utils/dueDate'
import { getItemTypeStyle, type CalendarItemType } from '../utils/itemTypeStyle'
import { displayTitle } from '../utils/mealPlanGrouping'
import { isMedicalRecordOverdue } from '../utils/medicalDueState'
import { nextOccurrenceDate } from '../utils/recurrence'
import { Link, type Route } from '../router'
import { ErrorState } from './ui/ErrorState'
import { PlannerAreaCard } from './planner/PlannerAreaCard'

interface QuickAction {
  to: Route
  label: string
  type: Extract<CalendarItemType, 'chore' | 'activity' | 'medical' | 'meal'>
}

export function PlannerScreen() {
  const {
    chores,
    pendingCompletions,
    activities,
    medicalRecords,
    planEntries,
    voteRounds,
    latestCompletionFor,
    loading,
    error,
    refreshAll,
  } = useFamilyData()

  if (loading) return <p className="loading">{t.loading.generic}</p>
  if (error) return <ErrorState message={error} onRetry={refreshAll} />

  const today = todayISODate()
  const activeChores = chores.filter((chore) => getChoreState(chore, latestCompletionFor(chore.id)) !== 'done')
  const overdueChores = activeChores.filter((chore) => chore.due_date < today)
  const activeActivities = activities.filter((activity) => activity.status === 'active')
  const overduePayments = activities.filter(
    (activity) =>
      activity.status !== 'finished' &&
      activity.next_payment_due_date !== null &&
      activity.next_payment_due_date < today
  )

  const nextActivity = activeActivities
    .map((activity) => ({ activity, date: nextOccurrenceDate(activity, today) }))
    .filter((item): item is { activity: (typeof activeActivities)[number]; date: string } => item.date !== null)
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  const nextMedical = medicalRecords
    .filter((record) => record.status === 'planned' && record.record_date >= today)
    .sort((a, b) => a.record_date.localeCompare(b.record_date))[0]
  const overdueMedical = medicalRecords.filter((record) => isMedicalRecordOverdue(record, today))

  const nextMeal = planEntries
    .filter(
      (entry) =>
        entry.entry_date >= today && (entry.status === 'confirmed' || entry.status === 'completed')
    )
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))[0]
  const openVotes = voteRounds.filter((round) => round.status === 'open')

  const quickActions: QuickAction[] = [
    { to: '/chores', label: t.planner.addChore, type: 'chore' },
    { to: '/activities', label: t.planner.addActivity, type: 'activity' },
    { to: '/health', label: t.planner.addMedical, type: 'medical' },
    { to: '/meals', label: t.planner.addMeal, type: 'meal' },
  ]

  const choreStyle = getItemTypeStyle('chore')
  const activityStyle = getItemTypeStyle('activity')
  const medicalStyle = getItemTypeStyle('medical')
  const mealStyle = getItemTypeStyle('meal')

  return (
    <>
      <div className="home-header">
        <h1 className="home-title">{t.planner.title}</h1>
        <p className="home-subtitle">{t.planner.subtitle}</p>
      </div>

      <section className="section planner-section">
        <h2>{t.planner.quickActionsTitle}</h2>
        <div className="planner-quick-actions">
          {quickActions.map((action) => {
            const style = getItemTypeStyle(action.type)
            return (
              <Link key={action.to} to={action.to} className="planner-quick-action">
                <span className="planner-quick-icon" style={{ color: `var(${style.colorVar})` }}>
                  {style.icon}
                </span>
                <span>{action.label}</span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="section planner-section">
        <h2>{t.planner.overviewTitle}</h2>
        <div className="planner-area-grid">
          <PlannerAreaCard
            to="/chores"
            icon={choreStyle.icon}
            colorVar={choreStyle.colorVar}
            title={t.planner.choresTitle}
            summary={t.planner.choresActive(activeChores.length)}
            details={[
              t.planner.choresPending(pendingCompletions.length),
              t.planner.choresOverdue(overdueChores.length),
            ]}
            ariaLabel={t.planner.openArea(t.planner.choresTitle)}
          />
          <PlannerAreaCard
            to="/activities"
            icon={activityStyle.icon}
            colorVar={activityStyle.colorVar}
            title={t.planner.activitiesTitle}
            summary={t.planner.activitiesActive(activeActivities.length)}
            details={[
              nextActivity
                ? t.planner.activitiesNext(
                    nextActivity.activity.title,
                    formatDueDateLabel(nextActivity.date, today)
                  )
                : t.planner.activitiesNone,
              t.planner.paymentsOverdue(overduePayments.length),
            ]}
            ariaLabel={t.planner.openArea(t.planner.activitiesTitle)}
          />
          <PlannerAreaCard
            to="/health"
            icon={medicalStyle.icon}
            colorVar={medicalStyle.colorVar}
            title={t.planner.healthTitle}
            summary={
              nextMedical
                ? t.planner.healthNext(
                    nextMedical.title,
                    formatDueDateLabel(nextMedical.record_date, today)
                  )
                : t.planner.healthNone
            }
            details={[t.planner.healthOverdue(overdueMedical.length)]}
            ariaLabel={t.planner.openArea(t.planner.healthTitle)}
          />
          <PlannerAreaCard
            to="/meals"
            icon={mealStyle.icon}
            colorVar={mealStyle.colorVar}
            title={t.planner.mealsTitle}
            summary={
              nextMeal
                ? t.planner.mealsNext(
                    displayTitle(nextMeal, '—'),
                    formatDueDateLabel(nextMeal.entry_date, today)
                  )
                : t.planner.mealsNone
            }
            details={[t.planner.mealsVoting(openVotes.length)]}
            ariaLabel={t.planner.openArea(t.planner.mealsTitle)}
          />
        </div>
      </section>
    </>
  )
}
