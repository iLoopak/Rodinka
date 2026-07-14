import { useEffect, useState } from 'react'
import { t } from '../strings'
import { useFamilyData } from '../context/FamilyDataContext'
import { AddMedicalRecordForm } from './AddMedicalRecordForm'
import { MedicalDetailModal } from './MedicalDetailModal'
import { Modal } from './ui/Modal'
import { ErrorState } from './ui/ErrorState'
import { EmptyState } from './ui/EmptyState'
import { DueBadge } from './ui/DueBadge'
import { MemberAvatar } from './ui/MemberAvatar'
import { MEDICAL_RECORD_TYPE_VALUES, medicalRecordTypeLabel } from '../utils/medicalLabels'
import { formatFullDate, todayISODate } from '../utils/dueDate'
import { isMedicalRecordOverdue } from '../utils/medicalDueState'
import { onActivateKey } from '../utils/a11y'
import type { MedicalRecord } from '../hooks/useMedicalRecords'
import type { MedicalRecordInput } from '../context/FamilyDataContext'
import { useRouter } from '../router'
import { resolveDeepLinkedItem } from '../utils/deepLinks'

type Tab = 'upcoming' | 'history' | 'vaccinations' | 'overdue'

export function HealthScreen() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null)
  const [filterMember, setFilterMember] = useState('')
  const [filterType, setFilterType] = useState('')
  const [deepLinkError, setDeepLinkError] = useState(false)
  const { searchParams, setQueryParam, removeQueryParam } = useRouter()
  const recordParam = searchParams.get('record')

  const { medicalRecords, members, currentMember, memberName, memberById, isParentOrAdmin, addMedicalRecord, updateMedicalRecord, loading, error, refreshAll } =
    useFamilyData()

  useEffect(() => {
    if (loading) return
    const resolution = resolveDeepLinkedItem(medicalRecords, recordParam)
    if (resolution.status === 'found') {
      setSelectedRecord(resolution.item)
      setTab(resolution.item.status === 'planned' ? 'upcoming' : 'history')
      setDeepLinkError(false)
    } else if (resolution.status === 'invalid' || resolution.status === 'not_found') {
      setSelectedRecord(null)
      setDeepLinkError(true)
    } else {
      setSelectedRecord(null)
      setDeepLinkError(false)
    }
  }, [loading, medicalRecords, recordParam])

  if (loading) {
    return <p className="loading">{t.loading.generic}</p>
  }

  if (error) {
    return <ErrorState message={error} onRetry={refreshAll} />
  }

  async function handleAdd(input: MedicalRecordInput) {
    await addMedicalRecord(input)
    setShowAdd(false)
  }

  const hasFilters = filterMember !== '' || filterType !== ''
  function clearFilters() {
    setFilterMember('')
    setFilterType('')
  }

  function openRecord(record: MedicalRecord) {
    setSelectedRecord(record)
    setDeepLinkError(false)
    setQueryParam('record', record.id)
  }

  function closeRecord() {
    setSelectedRecord(null)
    if (recordParam !== null) removeQueryParam('record')
  }

  const filtered = medicalRecords.filter((r) => {
    if (filterMember && r.patient_id !== filterMember) return false
    if (filterType && r.record_type !== filterType) return false
    return true
  })

  const today = todayISODate()
  const upcoming = filtered.filter((r) => r.status === 'planned')
  const history = filtered.filter((r) => r.status !== 'planned')
  const vaccinations = filtered.filter((r) => r.record_type === 'vaccination')
  const overdue = filtered.filter((r) => isMedicalRecordOverdue(r, today))

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'upcoming', label: t.medical.tabUpcoming, count: upcoming.length },
    { id: 'overdue', label: t.medical.tabOverdue, count: overdue.length },
    { id: 'history', label: t.medical.tabHistory, count: history.length },
    { id: 'vaccinations', label: t.medical.tabVaccinations, count: vaccinations.length },
  ]

  const listByTab: Record<Tab, MedicalRecord[]> = { upcoming, history, vaccinations, overdue }
  const emptyByTab: Record<Tab, string> = {
    upcoming: t.medical.noUpcoming,
    history: t.medical.noHistory,
    vaccinations: t.medical.noVaccinations,
    overdue: t.medical.noOverdue,
  }
  const currentList = listByTab[tab]

  return (
    <>
      <div className="screen-header">
        <h1 className="home-title">{t.medical.title}</h1>
        {isParentOrAdmin && (
          <button type="button" className="header-action-button" onClick={() => setShowAdd(true)}>
            <span aria-hidden="true">+</span> {t.medical.addAction}
          </button>
        )}
      </div>

      {deepLinkError && <p className="error" role="alert">{t.deepLinks.notFound}</p>}

      <div className="filter-row">
        <select value={filterMember} onChange={(e) => setFilterMember(e.target.value)} aria-label={t.medical.filterMemberLabel}>
          <option value="">
            {t.medical.filterMemberLabel}: {t.medical.filterAll}
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label={t.medical.filterTypeLabel}>
          <option value="">
            {t.medical.filterTypeLabel}: {t.medical.filterAll}
          </option>
          {MEDICAL_RECORD_TYPE_VALUES.map((type) => (
            <option key={type} value={type}>
              {medicalRecordTypeLabel(type)}
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

      <section className="section">
        {currentList.length === 0 ? (
          hasFilters ? (
            <EmptyState title={t.medical.filtersNoResults} action={{ label: t.medical.clearFilters, onClick: clearFilters }} />
          ) : (
            <p className="empty-state">{emptyByTab[tab]}</p>
          )
        ) : (
          <ul className="section-list">
            {currentList.map((record) => (
              <MedicalRow key={record.id} record={record} memberById={memberById} onClick={() => openRecord(record)} />
            ))}
          </ul>
        )}
      </section>

      {showAdd && (
        <Modal title={t.medical.addTitle} onClose={() => setShowAdd(false)}>
          <AddMedicalRecordForm members={members} currentMemberId={currentMember.id} onSubmit={handleAdd} />
        </Modal>
      )}

      {selectedRecord && (
        <MedicalDetailModal
          record={selectedRecord}
          members={members}
          currentMemberId={currentMember.id}
          memberName={memberName}
          memberById={memberById}
          onUpdate={updateMedicalRecord}
          onClose={closeRecord}
        />
      )}
    </>
  )
}

interface MedicalRowProps {
  record: MedicalRecord
  memberById: ReturnType<typeof useFamilyData>['memberById']
  onClick: () => void
}

function MedicalRow({ record, memberById, onClick }: MedicalRowProps) {
  const dueDate = record.record_type === 'vaccination' ? record.vaccine_next_dose_date : record.next_due_date
  const patient = memberById(record.patient_id)
  return (
    <li className="clickable-row" role="button" tabIndex={0} onClick={onClick} onKeyDown={onActivateKey(onClick)}>
      <MemberAvatar member={patient} />
      <span className="row-title">{record.title}</span>
      <span className="row-meta">{patient?.display_name ?? '?'}</span>
      <span className="row-spacer" />
      <span className="row-meta">{formatFullDate(record.record_date)}</span>
      {dueDate && <DueBadge dueDate={dueDate} />}
    </li>
  )
}
