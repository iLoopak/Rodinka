import { useState } from 'react'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useChoresData } from '../../context/chores/ChoresContext'
import { useActivitiesData } from '../../context/activities/ActivitiesContext'
import { useMedicalData } from '../../context/health/MedicalContext'
import { useOccurrenceAssignmentsData } from '../../context/activities/OccurrenceAssignmentsContext'
import { useRouterActions, type Route } from '../../router'
import { t } from '../../strings'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { getChoreState } from '../../utils/choreState'
import { formatFullDate } from '../../utils/dueDate'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import { recordToInput } from '../MedicalDetailModal'
import { Modal } from '../ui/Modal'
import { MemberAvatar } from '../ui/MemberAvatar'
import { ShareLinkButton } from '../ui/ShareLinkButton'
import { eligibleOccurrenceMembers } from '../../utils/occurrenceAssignments'
import { capabilitiesFor } from '../../utils/uiCapabilities'
import { useCalendarOffline } from '../../context/calendar/CalendarOfflineContext'
import { AddChoreForm } from '../AddChoreForm'
import { AddActivityForm } from '../AddActivityForm'

interface Props {
  entry: CalendarEntry
  onClose: () => void
  openAssignmentInitially?: boolean
}

export function CalendarEntryDetailModal({ entry, onClose, openAssignmentInitially = false }: Props) {
  const { currentMember, isParentOrAdmin } = useFamilyCore()
  const capabilities = capabilitiesFor(currentMember)
  const { members: liveMembers, memberById: liveMemberById } = useFamilyMembersData()
  const { chores: liveChores, latestCompletionFor, markDone, refreshChores } = useChoresData()
  const { medicalRecords: liveMedicalRecords, updateMedicalRecord } = useMedicalData()
  const { refreshActivities } = useActivitiesData()
  const { setOccurrenceMember } = useOccurrenceAssignmentsData()
  const { navigate } = useRouterActions()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assignmentOpen, setAssignmentOpen] = useState(openAssignmentInitially)
  const [editingPending, setEditingPending] = useState(false)
  const [displayMemberId, setDisplayMemberId] = useState(entry.responsibleMemberId)
  const [isOverride, setIsOverride] = useState(Boolean(entry.assignmentOverridden))
  const calendar = useCalendarOffline()
  const members = liveMembers.length > 0 ? liveMembers : calendar.members
  const memberById = liveMembers.length > 0 ? liveMemberById : calendar.memberById
  const chores = calendar.chores.length > 0 ? calendar.chores : liveChores
  const medicalRecords = calendar.medicalRecords.length > 0 ? calendar.medicalRecords : liveMedicalRecords
  const pendingMutation = calendar.pendingCalendarRecords.get(entry.sourceId)
  const pendingActivity = calendar.activities.find((activity) => activity.id === entry.sourceId)
  const pendingRecord = Boolean(pendingMutation)
  const existingRecordReadOnly = !pendingRecord && (calendar.calendarSyncStatus === 'offline' || calendar.calendarSyncStatus === 'error')

  const style = getItemTypeStyle(entry.type)
  const chore = entry.sourceType === 'chore' ? chores.find((item) => item.id === entry.sourceId) : undefined
  const medicalRecord =
    entry.sourceType === 'medical' || entry.sourceType === 'medical_due'
      ? medicalRecords.find((record) => record.id === entry.sourceId)
      : undefined

  const canMarkChoreDone = !pendingRecord && !existingRecordReadOnly && chore && getChoreState(chore, latestCompletionFor(chore.id)) === 'actionable'
    && capabilities.completeTaskFor(chore.family_id, displayMemberId ?? chore.assigned_to)
  const canMarkMedicalDone = !pendingRecord && !existingRecordReadOnly && capabilities.manageMedicalRecords && medicalRecord && medicalRecord.status === 'planned'

  const sourceRoute: Route =
    entry.sourceType === 'chore'
      ? '/chores'
      : entry.sourceType === 'allowance'
        ? '/chores'
      : entry.sourceType === 'activity' || entry.sourceType === 'activity_payment'
        ? '/activities'
        : entry.sourceType === 'meal'
          ? '/meals'
          : '/health'

  async function handleMarkChoreDone() {
    if (!chore) return
    setBusy(true)
    setError(null)
    try {
      await markDone(chore.id, displayMemberId ?? undefined, entry.date)
      onClose()
    } catch (err) {
      console.error('Failed to update calendar entry:', err)
      setError(t.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  async function handleMarkMedicalDone() {
    if (!medicalRecord) return
    setBusy(true)
    setError(null)
    try {
      await updateMedicalRecord(medicalRecord.id, { ...recordToInput(medicalRecord), status: 'completed' })
      onClose()
    } catch (err) {
      console.error('Failed to remove calendar entry:', err)
      setError(t.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  const personId = entry.childOrPatientId ?? entry.responsibleMemberId
  const person = personId ? memberById(personId) : undefined
  const responsible = displayMemberId ? memberById(displayMemberId) : undefined
  const showResponsible = displayMemberId && displayMemberId !== entry.childOrPatientId
  const canChangeAssignment = Boolean(!pendingRecord && !existingRecordReadOnly && isParentOrAdmin && entry.assignmentSeriesType && (entry.sourceType === 'chore' || entry.sourceType === 'activity'))
  const eligibleMembers = entry.assignmentSeriesType ? eligibleOccurrenceMembers(members, entry.assignmentSeriesType) : []

  async function changeOccurrenceMember(memberId: string | null, restoreDefault = false) {
    if (!entry.assignmentSeriesType) return
    const previousMemberId = displayMemberId
    const previousOverride = isOverride
    setDisplayMemberId(restoreDefault ? entry.defaultResponsibleMemberId ?? null : memberId)
    setIsOverride(!restoreDefault && Boolean(entry.recurring))
    setBusy(true)
    setError(null)
    try {
      await setOccurrenceMember(entry.assignmentSeriesType, entry.sourceId, entry.date, memberId, restoreDefault)
      await (entry.assignmentSeriesType === 'activity' ? refreshActivities() : refreshChores())
      setAssignmentOpen(false)
    } catch {
      setDisplayMemberId(previousMemberId)
      setIsOverride(previousOverride)
      setError(t.calendar.overrideSaveError)
    } finally {
      setBusy(false)
    }
  }

  if (editingPending && pendingMutation?.type === 'create_chore' && chore) {
    return <Modal title={t.calendar.editPendingTitle} onClose={() => setEditingPending(false)}>
      <AddChoreForm
        members={members}
        currentMemberId={currentMember.id}
        initial={chore}
        onSubmit={async (input) => {
          await calendar.updatePendingCalendarRecord(entry.sourceId, input)
          onClose()
        }}
      />
    </Modal>
  }

  if (editingPending && pendingMutation?.type === 'create_activity' && pendingActivity) {
    return <Modal title={t.calendar.editPendingTitle} onClose={() => setEditingPending(false)}>
      <AddActivityForm
        members={members}
        kids={members.filter((member) => member.role === 'child')}
        initial={pendingActivity}
        onSubmit={async (input) => {
          await calendar.updatePendingCalendarRecord(entry.sourceId, input)
          onClose()
        }}
      />
    </Modal>
  }

  return (
    <Modal title={entry.title} onClose={onClose}>
      <div className="detail-view">
        <p className="row-meta" style={{ color: `var(${style.colorVar})` }}>
          {style.icon} {style.label}
        </p>
        {pendingMutation && <p className={`badge badge-pending calendar-detail-sync ${pendingMutation.status}`}>
          {pendingMutation.status === 'failed' ? t.calendar.syncRecordFailed : pendingMutation.status === 'syncing' ? t.calendar.syncRecordSyncing : t.calendar.pendingSync}
        </p>}
        {pendingMutation?.error && <p className="error" role="alert">{t.calendar.syncRecordError}</p>}
        {existingRecordReadOnly && <p className="info-note">{t.calendar.offlineReadOnly}</p>}
        <p className="row-meta">
          {entry.isMultiDay && entry.rangeStart && entry.rangeEnd
            ? `${formatFullDate(entry.rangeStart)} – ${formatFullDate(entry.rangeEnd)}`
            : formatFullDate(entry.date)}
          {entry.time ? ` · ${entry.time.slice(0, 5)}` : ''}
        </p>
        {(entry.participantMemberIds?.length ?? 0) > 1 ? entry.participantMemberIds!.map((id) => {
          const participant = memberById(id)
          return participant ? <div className="detail-person" key={id}><MemberAvatar member={participant} /><span>{participant.display_name}</span></div> : null
        }) : person && (
          <div className="detail-person">
            <MemberAvatar member={person} />
            <span>{person.display_name}</span>
          </div>
        )}
        {showResponsible && entry.responsibleMemberId && (
          <div className="detail-person">
            <MemberAvatar member={responsible} />
            <span>{t.calendar.responsibleLabel(responsible?.display_name ?? '?')}</span>
          </div>
        )}
        {canChangeAssignment && <div className="occurrence-assignment">
          <span className="field-label">{entry.assignmentSeriesType === 'activity' ? t.calendar.companionTitle : t.calendar.assigneeTitle}</span>
          <button
            type="button"
            className="btn-secondary occurrence-assignment-trigger"
            aria-expanded={assignmentOpen}
            aria-label={entry.assignmentSeriesType === 'activity' ? t.calendar.changeCompanion : t.calendar.changeAssignee}
            onClick={() => setAssignmentOpen((value) => !value)}
          >
            {responsible && <MemberAvatar member={responsible} />}
            {responsible?.display_name ?? t.calendar.unassignedMember}
            {isOverride && <span className="badge" aria-label={t.calendar.occurrenceOverrideBadge}>↔ {t.calendar.occurrenceOverrideBadge}</span>}
          </button>
          {assignmentOpen && <div className="occurrence-assignment-options" role="group" aria-label={entry.assignmentSeriesType === 'activity' ? t.calendar.changeCompanion : t.calendar.changeAssignee}>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => changeOccurrenceMember(null)}>{t.calendar.unassignedMember}</button>
            {eligibleMembers.map((member) => <button
              key={member.id}
              type="button"
              className={`btn-secondary${member.id === displayMemberId ? ' active' : ''}`}
              aria-pressed={member.id === displayMemberId}
              disabled={busy}
              onClick={() => changeOccurrenceMember(member.id)}
            ><MemberAvatar member={member} />{member.display_name}</button>)}
            {isOverride && <button type="button" className="btn-link" disabled={busy} onClick={() => changeOccurrenceMember(null, true)}>
              {entry.assignmentSeriesType === 'activity' ? t.calendar.restoreDefaultCompanion : t.calendar.restoreDefaultAssignee}
            </button>}
          </div>}
        </div>}
        {entry.subtitle && <p className="row-meta">{entry.subtitle}</p>}
      </div>
      <div className="family-actions">
        {pendingMutation && <button type="button" className="btn-secondary" onClick={() => setEditingPending(true)} disabled={pendingMutation.status === 'syncing'}>
          {t.calendar.editPending}
        </button>}
        {pendingMutation?.status === 'failed' && <button type="button" className="btn-secondary" onClick={() => void calendar.retryCalendarRecord(entry.sourceId)}>
          {t.calendar.syncRetry}
        </button>}
        {pendingMutation && <button type="button" className="btn-link danger-action" onClick={() => {
          if (window.confirm(t.calendar.discardPendingConfirm(entry.title))) {
            void calendar.discardCalendarRecord(entry.sourceId).then(onClose)
          }
        }}>
          {t.calendar.discardPending}
        </button>}
        {canMarkChoreDone && (
          <button onClick={handleMarkChoreDone} disabled={busy}>
            {t.chores.markDone}
          </button>
        )}
        {canMarkMedicalDone && (
          <button onClick={handleMarkMedicalDone} disabled={busy}>
            {t.medical.markCompleted}
          </button>
        )}
        {!pendingRecord && <button
          className="btn-secondary"
          onClick={() => {
            navigate(sourceRoute)
            onClose()
          }}
        >
          {t.calendar.openRecord}
        </button>}
        {!pendingRecord && <ShareLinkButton route="/calendar" param="event" id={entry.sourceId} title={entry.title} />}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  )
}
