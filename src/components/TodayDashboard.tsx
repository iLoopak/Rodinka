import type { MouseEvent } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { useRouter } from '../router'
import { ChoreList } from './ChoreList'
import { PendingApprovals } from './PendingApprovals'
import { EmptyState } from './ui/EmptyState'
import { ErrorState } from './ui/ErrorState'
import { formatDueDateLabel, todayISODate } from '../utils/dueDate'
import { nextOccurrenceDate } from '../utils/recurrence'
import { isMedicalRecordOverdue } from '../utils/medicalDueState'

const PENDING_PREVIEW_COUNT = 3

export function TodayDashboard() {
  const {
    currentMember,
    kids,
    chores,
    todaysChores,
    activities,
    medicalRecords,
    pendingCompletions,
    balances,
    memberName,
    latestCompletionFor,
    markDone,
    approve,
    reject,
    loading,
    error,
    refreshAll,
  } = useFamilyData()
  const { navigate } = useRouter()

  if (loading) {
    return <p className="loading">{t.loading.generic}</p>
  }

  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />
  }

  function goTo(path: '/chores' | '/family' | '/calendar', hash?: string) {
    return (e: MouseEvent) => {
      e.preventDefault()
      if (hash) window.history.replaceState(null, '', `${path}${hash}`)
      navigate(path)
    }
  }

  if (kids.length === 0) {
    return (
      <>
        <Header name={currentMember.display_name} />
        <section className="section">
          <EmptyState
            title={t.today.setupAddChildTitle}
            body={t.today.setupAddChildBody}
            action={{ label: t.today.setupAddChildAction, onClick: () => navigate('/family') }}
          />
        </section>
      </>
    )
  }

  if (chores.length === 0) {
    return (
      <>
        <Header name={currentMember.display_name} />
        <section className="section">
          <EmptyState
            title={t.today.setupAddChoreTitle}
            body={t.today.setupAddChoreBody}
            action={{ label: t.today.setupAddChoreAction, onClick: () => navigate('/chores') }}
          />
        </section>
      </>
    )
  }

  const pendingPreview = pendingCompletions.slice(0, PENDING_PREVIEW_COUNT)
  const pendingRemaining = pendingCompletions.length - pendingPreview.length

  const today = todayISODate()

  let nextActivity: { title: string; date: string } | null = null
  for (const activity of activities) {
    if (activity.status !== 'active') continue
    const date = nextOccurrenceDate(activity, today)
    if (date && (!nextActivity || date < nextActivity.date)) {
      nextActivity = { title: activity.title, date }
    }
  }

  const nextMedical = medicalRecords
    .filter((r) => r.status === 'planned' && r.record_date >= today)
    .sort((a, b) => (a.record_date < b.record_date ? -1 : 1))[0]

  const overdueCount =
    activities.filter((a) => a.status !== 'finished' && a.next_payment_due_date && a.next_payment_due_date < today)
      .length + medicalRecords.filter((r) => isMedicalRecordOverdue(r, today)).length

  return (
    <>
      <Header name={currentMember.display_name} />

      {pendingCompletions.length > 0 && (
        <section className="section">
          <h2>{t.today.approvalsTitle}</h2>
          <PendingApprovals
            completions={pendingPreview}
            chores={chores}
            memberName={memberName}
            onApprove={approve}
            onReject={reject}
          />
          {pendingRemaining > 0 && (
            <a className="link section-footer-link" href="/chores" onClick={goTo('/chores', '#pending')}>
              {t.today.approvalsMore(pendingRemaining)}
            </a>
          )}
        </section>
      )}

      <section className="section">
        <h2>{t.today.choresTitle}</h2>
        {todaysChores.length === 0 ? (
          <p className="empty-state">{t.today.choresEmpty}</p>
        ) : (
          <ChoreList
            chores={todaysChores}
            memberName={memberName}
            latestCompletionFor={latestCompletionFor}
            onMarkDone={markDone}
          />
        )}
      </section>

      <section className="section">
        <h2>{t.today.allowanceTitle}</h2>
        <ul className="section-list">
          {kids.map((kid) => (
            <li key={kid.id}>
              <span className="row-title">{kid.display_name}</span>
              <span className="row-spacer" />
              <span className="row-amount">{t.chores.formatAmount(balances.get(kid.id) ?? 0)}</span>
            </li>
          ))}
        </ul>
        <a className="link section-footer-link" href="/chores" onClick={goTo('/chores', '#allowance')}>
          {t.today.allowanceSeeAll}
        </a>
      </section>

      <section className="section">
        <h2>{t.calendar.title}</h2>
        <ul className="section-list plain-list">
          <li>
            <span className="row-meta">{t.today.nextActivityTitle}</span>
            <span className="row-spacer" />
            <span className="row-title">
              {nextActivity ? `${nextActivity.title} · ${formatDueDateLabel(nextActivity.date, today)}` : t.today.nextActivityEmpty}
            </span>
          </li>
          <li>
            <span className="row-meta">{t.today.nextMedicalTitle}</span>
            <span className="row-spacer" />
            <span className="row-title">
              {nextMedical ? `${nextMedical.title} · ${formatDueDateLabel(nextMedical.record_date, today)}` : t.today.nextMedicalEmpty}
            </span>
          </li>
          {overdueCount > 0 && (
            <li>
              <span className="row-meta">{t.today.overduePaymentsTitle}</span>
              <span className="row-spacer" />
              <span className="badge badge-overdue">{overdueCount}</span>
            </li>
          )}
        </ul>
        <a className="link section-footer-link" href="/calendar" onClick={goTo('/calendar')}>
          {t.today.seeCalendar}
        </a>
      </section>
    </>
  )
}

function Header({ name }: { name: string }) {
  return (
    <div className="home-header">
      <h1 className="home-title">{t.home.title}</h1>
      <p className="home-subtitle">{t.home.welcome(name)}</p>
    </div>
  )
}
