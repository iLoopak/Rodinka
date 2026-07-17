import { useEffect, useState } from 'react'
import { t } from '../strings'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../context/family/FamilyMembersContext'
import { useActivitiesData } from '../context/activities/ActivitiesContext'
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
import type { ActivityInput } from '../domain/activities/types'
import { useRouter } from '../router'
import { resolveDeepLinkedItem } from '../utils/deepLinks'
import { ScrollableTabs } from './ui/ScrollableTabs'
import { FilterDisclosure } from './ui/FilterDisclosure'
import { ScreenHeader } from './ui/ScreenHeader'
import { PersonRoleGroup, type PersonRole } from './ui/PersonRoleGroup'

type Tab = 'upcoming' | 'payments' | 'archived'

export function ActivitiesScreen() {
  const [tab, setTab] = useState<Tab>(() => window.location.hash === '#payments' ? 'payments' : 'upcoming')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [filterChild, setFilterChild] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterKind, setFilterKind] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [deepLinkError, setDeepLinkError] = useState(false)
  const { searchParams, setQueryParam, removeQueryParam } = useRouter()
  const activityParam = searchParams.get('activity')

  const { isParentOrAdmin } = useFamilyCore()
  const { kids, members, memberName, memberById } = useFamilyMembersData()
  const {
    activities,
    addActivity,
    updateActivity,
    markActivityPaymentPaid,
    activitiesLoading: loading,
    activitiesError: error,
    refreshActivities: refreshAll,
  } = useActivitiesData()

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
    <ScreenHeader title={t.activities.title} actions={isParentOrAdmin ? (
        <button type="button" className="header-action-button" onClick={() => setShowAdd(true)}>
          <span aria-hidden="true">+</span> {t.activities.addAction}
        </button>
      ) : undefined} />
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

      <FilterDisclosure id="activities-filter-panel" open={filtersOpen} onOpenChange={setFiltersOpen}
        activeCount={Number(Boolean(filterChild)) + Number(Boolean(filterCategory)) + Number(Boolean(filterKind))} onClear={clearFilters}>
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
      </FilterDisclosure>

      <ScrollableTabs tabs={tabs} activeTab={tab} onChange={setTab} />

      {tab === 'upcoming' && (
        <section className="page-section">
          {upcoming.length === 0 ? (
            hasFilters ? (
              <EmptyState title={t.activities.filtersNoResults} action={{ label: t.activities.clearFilters, onClick: clearFilters }} />
            ) : (
              <p className="empty-state">{t.activities.noActivities}</p>
            )
          ) : (
            <div className="panel is-primary">
              <ul className="section-list plain-list">
                {upcoming.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    memberById={memberById}
                    onClick={() => openActivity(activity)}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === 'payments' && (
        <section className="page-section">
          {withPayments.length === 0 ? (
            <p className="empty-state">{t.activities.noUpcomingPayments}</p>
          ) : (
            <div className="panel is-primary">
              <ul className="section-list plain-list">
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
            </div>
          )}
        </section>
      )}

      {tab === 'archived' && (
        <section className="page-section">
          {archived.length === 0 ? (
            <p className="empty-state">{t.activities.noArchived}</p>
          ) : (
            <div className="panel is-primary">
              <ul className="section-list plain-list">
                {archived.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    memberById={memberById}
                    onClick={() => openActivity(activity)}
                  />
                ))}
              </ul>
            </div>
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
  memberById: ReturnType<typeof useFamilyMembersData>['memberById']
  onClick: () => void
}

function ActivityRow({ activity, memberById, onClick }: ActivityRowProps) {
  const next = nextOccurrenceDate(activity)
  const participants = activity.participant_ids.map(memberById).filter((member) => !!member)
  const responsibleIds = [activity.responsible_member_id, activity.secondary_responsible_member_id].filter((id): id is string => Boolean(id))
  const peopleRoles: PersonRole[] = [
    ...participants.map((member) => ({ member, label: t.common.participant })),
    ...responsibleIds.map((id) => ({ member: memberById(id), label: t.common.responsibleAdult })),
  ]
  return (
    <li className="clickable-row" role="button" tabIndex={0} onClick={onClick} onKeyDown={onActivateKey(onClick)}>
      <span className="row-title">{activity.title}</span>
      {activity.status !== 'active' && (
        <span className="badge badge-neutral">
          {activity.status === 'paused' ? t.activities.statusPaused : t.activities.statusFinished}
        </span>
      )}
      <PersonRoleGroup roles={peopleRoles} compact />
      <span className="row-spacer" />
      {next ? (
        <span className="row-meta">{formatFullDate(next)}</span>
      ) : (
        <span className="row-meta">{t.activities.noUpcomingOccurrence}</span>
      )}
    </li>
  )
}
