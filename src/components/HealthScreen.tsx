import { useEffect, useState } from 'react'
import { t } from '../strings'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../context/family/FamilyMembersContext'
import { useMedicalData } from '../context/health/MedicalContext'
import { MedicalDetailModal } from './MedicalDetailModal'
import { ErrorState } from './ui/ErrorState'
import { EmptyState } from './ui/EmptyState'
import { DueBadge } from './ui/DueBadge'
import { MEDICAL_RECORD_TYPE_VALUES, medicalRecordTypeLabel } from '../utils/medicalLabels'
import { formatFullDate, todayISODate } from '../utils/dueDate'
import { isMedicalRecordOverdue } from '../utils/medicalDueState'
import { onActivateKey } from '../utils/a11y'
import type { MedicalRecord } from '../hooks/useMedicalRecords'
import { useRouter } from '../router'
import { resolveDeepLinkedItem } from '../utils/deepLinks'
import { ScrollableTabs } from './ui/ScrollableTabs'
import { FilterDisclosure, FilterDisclosurePanel, FilterDisclosureToggle } from './ui/FilterDisclosure'
import { ScreenHeader } from './ui/ScreenHeader'
import { PersonRoleGroup, type PersonRole } from './ui/PersonRoleGroup'
import { useCreateRecord } from '../context/create-record/CreateRecordContext'

type Tab = 'upcoming' | 'history' | 'vaccinations' | 'overdue'

export function HealthScreen() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null)
  const [filterMember, setFilterMember] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [deepLinkError, setDeepLinkError] = useState(false)
  const { searchParams, setQueryParam, removeQueryParam } = useRouter()
  const { openCreateRecord } = useCreateRecord()
  const recordParam = searchParams.get('record')

  const { currentMember, isParentOrAdmin } = useFamilyCore()
  const { members, memberName, memberById } = useFamilyMembersData()
  const {
    medicalRecords,
    updateMedicalRecord,
    medicalLoading: loading,
    medicalError: error,
    refreshMedicalRecords: refreshAll,
  } = useMedicalData()

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
      <FilterDisclosure id="health-filter-panel" open={filtersOpen} onOpenChange={setFiltersOpen}
        activeCount={Number(Boolean(filterMember)) + Number(Boolean(filterType))} onClear={clearFilters}>
      <ScreenHeader title={t.medical.title} actions={<>
          <FilterDisclosureToggle />
          {isParentOrAdmin && <button type="button" className="header-action-button" onClick={() => openCreateRecord({ type: 'medical', source: 'health' })}>
            <span aria-hidden="true">+</span> {t.medical.addAction}
          </button>}
        </>} />

      {deepLinkError && <p className="error" role="alert">{t.deepLinks.notFound}</p>}

      <FilterDisclosurePanel>
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
      </FilterDisclosurePanel>
      </FilterDisclosure>

      <ScrollableTabs tabs={tabs} activeTab={tab} onChange={setTab} />

      <section className="page-section">
        {currentList.length === 0 ? (
          hasFilters ? (
            <EmptyState title={t.medical.filtersNoResults} action={{ label: t.medical.clearFilters, onClick: clearFilters }} />
          ) : (
            <p className="empty-state">{emptyByTab[tab]}</p>
          )
        ) : (
          <div className="panel is-primary">
            <ul className="section-list plain-list">
              {currentList.map((record) => (
                <MedicalRow key={record.id} record={record} memberById={memberById} onClick={() => openRecord(record)} />
              ))}
            </ul>
          </div>
        )}
      </section>

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
  memberById: ReturnType<typeof useFamilyMembersData>['memberById']
  onClick: () => void
}

function MedicalRow({ record, memberById, onClick }: MedicalRowProps) {
  const dueDate = record.record_type === 'vaccination' ? record.vaccine_next_dose_date : record.next_due_date
  const patient = record.patient_id ? memberById(record.patient_id) : undefined
  const roles: PersonRole[] = [
    { member: patient, label: t.common.patient },
    ...(record.responsible_member_id ? [{ member: memberById(record.responsible_member_id), label: t.common.responsibleAdult }] : []),
  ]
  return (
    <li className="clickable-row" role="button" tabIndex={0} onClick={onClick} onKeyDown={onActivateKey(onClick)}>
      <span className="row-title">{record.title}</span>
      <PersonRoleGroup roles={roles} compact />
      <span className="row-spacer" />
      <span className="row-meta">{formatFullDate(record.record_date)}</span>
      {dueDate && <DueBadge dueDate={dueDate} />}
    </li>
  )
}
