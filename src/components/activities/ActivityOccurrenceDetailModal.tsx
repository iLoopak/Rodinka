import { useState } from 'react'
import { Clock, MapPin } from 'lucide-react'
import { t } from '../../strings'
import { formatFullDate } from '../../utils/dueDate'
import { buildDeepLink } from '../../utils/deepLinks'
import { eligibleOccurrenceMembers } from '../../utils/occurrenceAssignments'
import type { CalendarEntry } from '../../utils/calendarEntries'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import { Modal } from '../ui/Modal'
import { ItemTypeIcon } from '../ui/ItemTypeIcon'
import { MemberAvatar } from '../ui/MemberAvatar'
import { PersonRoleGroup, type PersonRole } from '../ui/PersonRoleGroup'
import { DetailMetaRow } from '../ui/DetailMetaRow'
import { ShareLinkButton } from '../ui/ShareLinkButton'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useActivitiesData } from '../../context/activities/ActivitiesContext'
import { useOccurrenceAssignmentsData } from '../../context/activities/OccurrenceAssignmentsContext'
import { useCalendarOffline } from '../../context/calendar/CalendarOfflineContext'
import { useRouterActions } from '../../router'

interface Props {
  entry: CalendarEntry
  onClose: () => void
}

// The occurrence-level counterpart to ActivityDetailModal: same modal shell,
// icon, PersonRoleGroup and DetailMetaRow so the two read as one visual
// language, but scoped to a single date and focused on changing the
// companion for just that date (utils/occurrenceAssignments.ts) without
// touching the series' default responsible adult.
export function ActivityOccurrenceDetailModal({ entry, onClose }: Props) {
  const { isParentOrAdmin } = useFamilyCore()
  const { members: liveMembers, memberById: liveMemberById, memberName } = useFamilyMembersData()
  const { refreshActivities } = useActivitiesData()
  const { setOccurrenceMember } = useOccurrenceAssignmentsData()
  const { navigateHref } = useRouterActions()
  const calendar = useCalendarOffline()
  const members = liveMembers.length > 0 ? liveMembers : calendar.members
  const memberById = liveMembers.length > 0 ? liveMemberById : calendar.memberById

  const pendingMutation = calendar.pendingCalendarRecords.get(entry.sourceId)
  const existingRecordReadOnly = !pendingMutation && (calendar.calendarSyncStatus === 'offline' || calendar.calendarSyncStatus === 'error')
  const canChangeCompanion = Boolean(!pendingMutation && !existingRecordReadOnly && isParentOrAdmin)

  const defaultCompanionId = entry.defaultResponsibleMemberId ?? null
  const [displayMemberId, setDisplayMemberId] = useState(entry.responsibleMemberId)
  const [isOverride, setIsOverride] = useState(Boolean(entry.assignmentOverridden))
  const [selectedMemberId, setSelectedMemberId] = useState(entry.responsibleMemberId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const participants = (entry.participantMemberIds ?? [])
    .map((id) => memberById(id))
    .filter((member): member is FamilyMember => !!member)
  const defaultCompanion = defaultCompanionId ? memberById(defaultCompanionId) : undefined
  const currentCompanion = displayMemberId ? memberById(displayMemberId) : undefined
  const peopleRoles: PersonRole[] = [
    ...participants.map((member) => ({ member, label: t.common.participant })),
    ...(defaultCompanionId
      ? [{ member: defaultCompanion, fallbackName: memberName(defaultCompanionId), label: t.activities.defaultResponsibleAdultLabel }]
      : []),
    ...(isOverride && displayMemberId
      ? [{ member: currentCompanion, fallbackName: memberName(displayMemberId), label: t.activities.occurrenceCompanionLabel }]
      : []),
  ]

  const eligibleMembers = eligibleOccurrenceMembers(members, 'activity')
  const hasChange = selectedMemberId !== displayMemberId

  function selectCompanion(memberId: string | null) {
    setSelectedMemberId(memberId)
  }

  async function handleSave() {
    const restoreDefault = selectedMemberId === defaultCompanionId
    const previousMemberId = displayMemberId
    const previousOverride = isOverride
    setBusy(true)
    setError(null)
    try {
      await setOccurrenceMember('activity', entry.sourceId, entry.date, selectedMemberId, restoreDefault)
      await refreshActivities()
      setDisplayMemberId(restoreDefault ? defaultCompanionId : selectedMemberId)
      setIsOverride(!restoreDefault && entry.recurring)
    } catch {
      setSelectedMemberId(previousMemberId)
      setDisplayMemberId(previousMemberId)
      setIsOverride(previousOverride)
      setError(t.calendar.overrideSaveError)
    } finally {
      setBusy(false)
    }
  }

  function openFullActivityDetail() {
    navigateHref(buildDeepLink(window.location.origin, '/activities', 'activity', entry.sourceId))
    onClose()
  }

  return (
    <Modal title={entry.title} icon={<ItemTypeIcon type="activity" category={entry.category} size={32} />} onClose={onClose}>
      <div className="detail-view">
        <p className="row-meta">{t.activities.occurrenceLabel}</p>

        {pendingMutation && <p className={`badge badge-pending calendar-detail-sync ${pendingMutation.status}`}>
          {pendingMutation.status === 'failed' ? t.calendar.syncRecordFailed : pendingMutation.status === 'syncing' ? t.calendar.syncRecordSyncing : t.calendar.pendingSync}
        </p>}
        {existingRecordReadOnly && <p className="info-note">{t.calendar.offlineReadOnly}</p>}

        {peopleRoles.length > 0 && <PersonRoleGroup roles={peopleRoles} size="large" />}

        <div className="detail-meta-list">
          <DetailMetaRow icon={<Clock size={16} />}>
            {formatFullDate(entry.date)}
            {entry.time ? ` · ${entry.time.slice(0, 5)}${entry.endTime ? `–${entry.endTime.slice(0, 5)}` : ''}` : ''}
          </DetailMetaRow>
          {entry.location && <DetailMetaRow icon={<MapPin size={16} />}>{entry.location}</DetailMetaRow>}
        </div>

        <div className="occurrence-companion-section">
          <span className="field-label">
            {t.activities.occurrenceCompanionLabel}
            {isOverride && <span className="badge" aria-label={t.calendar.occurrenceOverrideBadge}>↔ {t.calendar.occurrenceOverrideBadge}</span>}
          </span>
          <p className="occurrence-companion-notice">{t.activities.occurrenceChangeNotice}</p>
          <div className="occurrence-companion-picker" role="group" aria-label={t.activities.occurrenceCompanionLabel}>
            <button
              type="button"
              className={`occurrence-companion-option${selectedMemberId === null ? ' active' : ''}`}
              aria-pressed={selectedMemberId === null}
              disabled={!canChangeCompanion || busy}
              onClick={() => selectCompanion(null)}
            >
              <span>{t.activities.responsibleNone}</span>
            </button>
            {eligibleMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                className={`occurrence-companion-option${selectedMemberId === member.id ? ' active' : ''}`}
                aria-pressed={selectedMemberId === member.id}
                disabled={!canChangeCompanion || busy}
                onClick={() => selectCompanion(member.id)}
              >
                <MemberAvatar member={member} size={44} />
                <span>{member.display_name}</span>
              </button>
            ))}
          </div>
          {isOverride && canChangeCompanion && (
            <button type="button" className="btn-link" disabled={busy} onClick={() => selectCompanion(defaultCompanionId)}>
              {t.calendar.restoreDefaultCompanion}
            </button>
          )}
        </div>

        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <div className="family-actions">
        {canChangeCompanion && <button onClick={handleSave} disabled={busy || !hasChange}>
          {t.activities.saveOccurrenceChange}
        </button>}
        <button type="button" className="btn-secondary" onClick={openFullActivityDetail}>
          {t.activities.fullActivityDetail}
        </button>
        <ShareLinkButton route="/activities" param="activity" id={entry.sourceId} title={entry.title} />
      </div>
    </Modal>
  )
}
