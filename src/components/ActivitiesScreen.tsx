import { useState } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { useRouter } from '../router'
import { AddActivityForm } from './AddActivityForm'
import { ActivityDetailModal } from './ActivityDetailModal'
import { Modal } from './ui/Modal'
import { ErrorState } from './ui/ErrorState'
import { EmptyState } from './ui/EmptyState'
import { DueBadge } from './ui/DueBadge'
import { MemberAvatar } from './ui/MemberAvatar'
import { ACTIVITY_CATEGORY_VALUES, activityCategoryLabel } from '../utils/activityLabels'
import { nextOccurrenceDate } from '../utils/recurrence'
import { formatFullDate } from '../utils/dueDate'
import { onActivateKey } from '../utils/a11y'
import type { Activity } from '../hooks/useActivities'
import type { ActivityInput } from '../context/FamilyDataContext'

type Tab = 'upcoming' | 'payments' | 'archived'

export function ActivitiesScreen() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [filterChild, setFilterChild] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const { navigate } = useRouter()

  const {
    activities,
    kids,
    members,
    currentMember,
    memberName,
    isParentOrAdmin,
    addActivity,
    updateActivity,
    loading,
    error,
    refreshAll,
  } = useFamilyData()

  if (loading) {
    return <p className="loading">{t.loading.generic}</p>
  }

  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />
  }

  async function handleAdd(input: ActivityInput) {
    await addActivity(input)
    setShowAdd(false)
  }

  const header = (
    <div className="screen-header">
      <h1 className="home-title">{t.activities.title}</h1>
      {isParentOrAdmin && (
        <button type="button" className="header-action-button" onClick={() => setShowAdd(true)}>
          <span aria-hidden="true">+</span> {t.activities.addAction}
        </button>
      )}
    </div>
  )

  if (kids.length === 0) {
    return (
      <>
        {header}
        <section className="section">
          <EmptyState
            title={t.activities.noActivities}
            action={{ label: t.family.addChildAction, onClick: () => navigate('/family') }}
          />
        </section>
        {showAdd && (
          <Modal title={t.activities.addTitle} onClose={() => setShowAdd(false)}>
            <AddActivityForm
              members={members}
              kids={kids}
              currentMemberId={currentMember.id}
              onSubmit={handleAdd}
            />
          </Modal>
        )}
      </>
    )
  }

  const hasFilters = filterChild !== '' || filterCategory !== ''
  function clearFilters() {
    setFilterChild('')
    setFilterCategory('')
  }

  const filtered = activities.filter((a) => {
    if (filterChild && a.child_id !== filterChild) return false
    if (filterCategory && a.category !== filterCategory) return false
    return true
  })

  const upcoming = filtered.filter((a) => a.status === 'active')
  const archived = filtered.filter((a) => a.status !== 'active')
  const withPayments = filtered.filter((a) => a.status !== 'finished' && a.next_payment_due_date)

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'upcoming', label: t.activities.tabUpcoming, count: upcoming.length },
    { id: 'payments', label: t.activities.tabPayments, count: withPayments.length },
    { id: 'archived', label: t.activities.tabArchived, count: archived.length },
  ]

  return (
    <>
      {header}

      <div className="filter-row">
        <select value={filterChild} onChange={(e) => setFilterChild(e.target.value)} aria-label={t.activities.filterChildLabel}>
          <option value="">
            {t.activities.filterChildLabel}: {t.activities.filterAll}
          </option>
          {kids.map((kid) => (
            <option key={kid.id} value={kid.id}>
              {kid.display_name}
            </option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          aria-label={t.activities.filterCategoryLabel}
        >
          <option value="">
            {t.activities.filterCategoryLabel}: {t.activities.filterAll}
          </option>
          {ACTIVITY_CATEGORY_VALUES.map((category) => (
            <option key={category} value={category}>
              {activityCategoryLabel(category)}
            </option>
          ))}
        </select>
      </div>

      <div className="tabs" role="tablist">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            role="tab"
            aria-selected={tab === tabItem.id}
            className={`tab-button${tab === tabItem.id ? ' active' : ''}`}
            onClick={() => setTab(tabItem.id)}
          >
            {tabItem.label}
            {!!tabItem.count && <span className="tab-count">{tabItem.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'upcoming' && (
        <section className="section">
          {upcoming.length === 0 ? (
            hasFilters ? (
              <EmptyState title={t.activities.filtersNoResults} action={{ label: t.activities.clearFilters, onClick: clearFilters }} />
            ) : (
              <p className="empty-state">{t.activities.noActivities}</p>
            )
          ) : (
            <ul className="section-list">
              {upcoming.map((activity) => (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                  memberName={memberName}
                  onClick={() => setSelectedActivity(activity)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'payments' && (
        <section className="section">
          {withPayments.length === 0 ? (
            <p className="empty-state">{t.activities.noUpcomingPayments}</p>
          ) : (
            <ul className="section-list">
              {withPayments.map((activity) => (
                <li
                  key={activity.id}
                  className="clickable-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedActivity(activity)}
                  onKeyDown={onActivateKey(() => setSelectedActivity(activity))}
                >
                  <span className="row-title">{activity.title}</span>
                  <span className="row-meta">{memberName(activity.child_id)}</span>
                  <span className="row-spacer" />
                  <DueBadge dueDate={activity.next_payment_due_date} />
                  {activity.payment_amount != null && (
                    <span className="row-amount">{t.chores.formatAmount(activity.payment_amount)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'archived' && (
        <section className="section">
          {archived.length === 0 ? (
            <p className="empty-state">{t.activities.noArchived}</p>
          ) : (
            <ul className="section-list">
              {archived.map((activity) => (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                  memberName={memberName}
                  onClick={() => setSelectedActivity(activity)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {showAdd && (
        <Modal title={t.activities.addTitle} onClose={() => setShowAdd(false)}>
          <AddActivityForm members={members} kids={kids} currentMemberId={currentMember.id} onSubmit={handleAdd} />
        </Modal>
      )}

      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          members={members}
          kids={kids}
          currentMemberId={currentMember.id}
          memberName={memberName}
          onUpdate={updateActivity}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </>
  )
}

interface ActivityRowProps {
  activity: Activity
  memberName: (id: string) => string
  onClick: () => void
}

function ActivityRow({ activity, memberName, onClick }: ActivityRowProps) {
  const next = nextOccurrenceDate(activity)
  return (
    <li className="clickable-row" role="button" tabIndex={0} onClick={onClick} onKeyDown={onActivateKey(onClick)}>
      <MemberAvatar member={{ id: activity.child_id, display_name: memberName(activity.child_id) }} />
      <span className="row-title">{activity.title}</span>
      <span className="row-meta">{memberName(activity.child_id)}</span>
      <span className="row-spacer" />
      {next ? (
        <span className="row-meta">{formatFullDate(next)}</span>
      ) : (
        <span className="row-meta">{t.activities.noUpcomingOccurrence}</span>
      )}
    </li>
  )
}
