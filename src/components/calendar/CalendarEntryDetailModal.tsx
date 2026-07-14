import { useState } from 'react'
import { useFamilyData } from '../../context/FamilyDataContext'
import { useRouter, type Route } from '../../router'
import { t } from '../../strings'
import type { CalendarEntry } from '../../utils/calendarEntries'
import { getChoreState } from '../../utils/choreState'
import { formatFullDate } from '../../utils/dueDate'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import { recordToInput } from '../MedicalDetailModal'
import { Modal } from '../ui/Modal'
import { MemberAvatar } from '../ui/MemberAvatar'

interface Props {
  entry: CalendarEntry
  onClose: () => void
}

export function CalendarEntryDetailModal({ entry, onClose }: Props) {
  const {
    chores,
    medicalRecords,
    memberById,
    latestCompletionFor,
    markDone,
    updateMedicalRecord,
  } = useFamilyData()
  const { navigate } = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      await markDone(chore.id, chore.assigned_to)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const personId = entry.childOrPatientId ?? entry.responsibleMemberId
  const person = personId ? memberById(personId) : undefined
  const responsible = entry.responsibleMemberId ? memberById(entry.responsibleMemberId) : undefined
  const showResponsible = entry.responsibleMemberId && entry.responsibleMemberId !== entry.childOrPatientId

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
      </div>
      {error && <p className="error">{error}</p>}
    </Modal>
  )
}
