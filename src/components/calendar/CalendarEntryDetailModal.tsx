import { useState } from 'react'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useChoresData } from '../../context/chores/ChoresContext'
import { useActivitiesData } from '../../context/activities/ActivitiesContext'
import { useMedicalData } from '../../context/health/MedicalContext'
import { useOccurrenceAssignmentsData } from '../../context/activities/OccurrenceAssignmentsContext'
import { useRouter, type Route } from '../../router'
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

interface Props {
  entry: CalendarEntry
  onClose: () => void
  openAssignmentInitially?: boolean
}

export function CalendarEntryDetailModal({ entry, onClose, openAssignmentInitially = false }: Props) {
  const { isParentOrAdmin } = useFamilyCore()
  const { members, memberById } = useFamilyMembersData()
  const { chores, latestCompletionFor, markDone, refreshChores } = useChoresData()
  const { medicalRecords, updateMedicalRecord } = useMedicalData()
  const { refreshActivities } = useActivitiesData()
  const { setOccurrenceMember } = useOccurrenceAssignmentsData()
  const { navigate } = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assignmentOpen, setAssignmentOpen] = useState(openAssignmentInitially)
  const [displayMemberId, setDisplayMemberId] = useState(entry.responsibleMemberId)
  const [isOverride, setIsOverride] = useState(Boolean(entry.assignmentOverridden))

  const style = getItemTypeStyle(entry.type)
  const chore = entry.sourceType === 'chore' ? chores.find((item) => item.id === entry.sourceId) : undefined
  const medicalRecord =
    entry.sourceType === 'medical' || entry.sourceType === 'medical_due'
      ? medicalRecords.find((record) => record.id === entry.sourceId)
      : undefined

  const canMarkChoreDone = chore && getChoreState(chore, latestCompletionFor(chore.id)) === 'actionable'
  const canMarkMedicalDone = medicalRecord && medicalRecord.status === 'planned'

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
  const canChangeAssignment = Boolean(isParentOrAdmin && entry.assignmentSeriesType && (entry.sourceType === 'chore' || entry.sourceType === 'activity'))
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

  return (
    <Modal title={entry.title} onClose={onClose}>
      <div className="detail-view">
        <p className="row-meta" style={{ color: `var(${style.colorVar})` }}>
          {style.icon} {style.label}
        </p>
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
        <button
          className="btn-secondary"
          onClick={() => {
            navigate(sourceRoute)
            onClose()
          }}
        >
          {t.calendar.openRecord}
        </button>
        <ShareLinkButton route="/calendar" param="event" id={entry.sourceId} title={entry.title} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  )
}
