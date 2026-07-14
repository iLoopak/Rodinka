import { useEffect, useState } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
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
import { useRouter } from '../router'
import { resolveDeepLinkedItem } from '../utils/deepLinks'

type Tab = 'upcoming' | 'payments' | 'archived'

export function ActivitiesScreen() {
  const [tab, setTab] = useState<Tab>(() => window.location.hash === '#payments' ? 'payments' : 'upcoming')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [filterChild, setFilterChild] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterKind, setFilterKind] = useState('')
  const [deepLinkError, setDeepLinkError] = useState(false)
  const { searchParams, setQueryParam, removeQueryParam } = useRouter()
  const activityParam = searchParams.get('activity')

  const {
    activities,
    kids,
    members,
    memberName,
    memberById,
    isParentOrAdmin,
    addActivity,
    updateActivity,
    markActivityPaymentPaid,
    loading,
    error,
    refreshAll,
  } = useFamilyData()

  useEffect(() => {
    if (loading) return
    const resolution = resolveDeepLinkedItem(activities, activityParam)
    if (resolution.status === 'found') {
      setSelectedActivity(resolution.item)
      setTab(resolution.item.status === 'active' ? 'upcoming' : 'archived')
      setDeepLinkError(false)
    } else if (resolution.status === 'invalid' || resolution.status === 'not_found') {
      setSelectedActivity(null)
      setDeepLinkError(true)
    } else {
      setSelectedActivity(null)
      setDeepLinkError(false)
    }
  }, [activities, activityParam, loading])

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

  const hasFilters = filterChild !== '' || filterCategory !== '' || filterKind !== ''
  function clearFilters() {
    setFilterChild('')
    setFilterCategory('')
    setFilterKind('')
  }

  function openActivity(activity: Activity) {
    setSelectedActivity(activity)
    setDeepLinkError(false)
    setQueryParam('activity', activity.id)
  }

  function closeActivity() {
    setSelectedActivity(null)
    if (activityParam !== null) removeQueryParam('activity')
  }

  const filtered = activities.filter((a) => {
    if (filterChild && !a.participant_ids.includes(filterChild) && a.responsible_member_id !== filterChild && a.secondary_responsible_member_id !== filterChild) return false
    if (filterCategory && a.category !== filterCategory) return false
    if (filterKind && a.kind !== filterKind) return false
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

      {deepLinkError && <p className="error" role="alert">{t.deepLinks.notFound}</p>}

      <div className="filter-row">
        <select value={filterChild} onChange={(e) => setFilterChild(e.target.value)} aria-label={t.activities.filterChildLabel}>
          <option value="">
            {t.activities.filterChildLabel}: {t.activities.filterAll}
          </option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.display_name}
            </option>
          ))}
        </select>
        <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} aria-label={t.activities.filterKindLabel}>
          <option value="">{t.activities.filterKindLabel}: {t.activities.filterAll}</option>
          <option value="club">{t.activities.kindClub}</option>
          <option value="event">{t.activities.kindEvent}</option>
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
                  memberById={memberById}
                  onClick={() => openActivity(activity)}
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
              {withPayments.map((activity) => {
                const child = memberById(activity.participant_ids[0] ?? '')
                return (
                  <li
                    key={activity.id}
                    className="clickable-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => openActivity(activity)}
                    onKeyDown={onActivateKey(() => openActivity(activity))}
                  >
                    <MemberAvatar member={child} />
                    <span className="row-title">{activity.title}</span>
                    <span className="row-meta">{child?.display_name ?? '?'}</span>
                    <span className="row-spacer" />
                    <DueBadge dueDate={activity.next_payment_due_date} />
                    {activity.payment_amount != null && (
                      <span className="row-amount">{t.chores.formatAmount(activity.payment_amount)}</span>
                    )}
                  </li>
                )
              })}
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
                  memberById={memberById}
                  onClick={() => openActivity(activity)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {showAdd && (
        <Modal title={t.activities.addTitle} onClose={() => setShowAdd(false)} className="activity-form-modal">
          <AddActivityForm members={members} kids={kids} onSubmit={handleAdd} />
        </Modal>
      )}

      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          members={members}
          kids={kids}
          memberName={memberName}
          memberById={memberById}
          onUpdate={updateActivity}
          onMarkPaymentPaid={markActivityPaymentPaid}
          onClose={closeActivity}
        />
      )}
    </>
  )
}

interface ActivityRowProps {
  activity: Activity
  memberById: ReturnType<typeof useFamilyData>['memberById']
  onClick: () => void
}

function ActivityRow({ activity, memberById, onClick }: ActivityRowProps) {
  const next = nextOccurrenceDate(activity)
  const participants = activity.participant_ids.map(memberById).filter((member) => !!member)
  const child = participants[0]
  return (
    <li className="clickable-row" role="button" tabIndex={0} onClick={onClick} onKeyDown={onActivateKey(onClick)}>
      <div className="avatar-stack">
        {participants.slice(0, 3).map((member) => <MemberAvatar key={member.id} member={member} />)}
        {participants.length > 3 && <span className="avatar-more">+{participants.length - 3}</span>}
      </div>
      <span className="row-title">{activity.title}</span>
      <span className="row-meta">{participants.map((member) => member.display_name).join(', ') || child?.display_name || '?'}</span>
      <span className="row-spacer" />
      {next ? (
        <span className="row-meta">{formatFullDate(next)}</span>
      ) : (
        <span className="row-meta">{t.activities.noUpcomingOccurrence}</span>
      )}
    </li>
  )
}
