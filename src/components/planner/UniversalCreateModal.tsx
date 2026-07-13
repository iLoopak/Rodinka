import { useState } from 'react'
import { useFamilyData } from '../../context/FamilyDataContext'
import { t } from '../../strings'
import { getItemTypeStyle } from '../../utils/itemTypeStyle'
import {
  getPlannerDatePrefill,
  type PlannerItemType,
} from '../../utils/plannerCreate'
import { AddActivityForm } from '../AddActivityForm'
import { AddChoreForm } from '../AddChoreForm'
import { AddMedicalRecordForm } from '../AddMedicalRecordForm'
import { AddPlanEntryForm } from '../meals/AddPlanEntryForm'
import { Modal } from '../ui/Modal'

interface Props {
  initialType?: PlannerItemType
  initialDate?: string
  onClose: () => void
}

interface CreateOption {
  type: PlannerItemType
  title: string
  description: string
}

export function UniversalCreateModal({ initialType, initialDate, onClose }: Props) {
  const [selectedType, setSelectedType] = useState<PlannerItemType | null>(initialType ?? null)
  const {
    members,
    kids,
    currentMember,
    meals,
    planEntries,
    addChore,
    addActivity,
    addMedicalRecord,
    addPlanEntry,
  } = useFamilyData()

  const options: CreateOption[] = [
    { type: 'chore', title: t.create.choreTitle, description: t.create.choreDescription },
    { type: 'activity', title: t.create.activityTitle, description: t.create.activityDescription },
    { type: 'medical', title: t.create.medicalTitle, description: t.create.medicalDescription },
    { type: 'meal', title: t.create.mealTitle, description: t.create.mealDescription },
  ]
  const selectedOption = options.find((option) => option.type === selectedType)
  const datePrefill = selectedType ? getPlannerDatePrefill(selectedType, initialDate) : null

  async function submitChore(input: Parameters<typeof addChore>[0]) {
    await addChore(input)
    onClose()
  }

  async function submitActivity(input: Parameters<typeof addActivity>[0]) {
    await addActivity(input)
    onClose()
  }

  async function submitMedical(input: Parameters<typeof addMedicalRecord>[0]) {
    await addMedicalRecord(input)
    onClose()
  }

  async function submitMeal(input: Parameters<typeof addPlanEntry>[0]) {
    await addPlanEntry(input)
    onClose()
  }

  return (
    <Modal title={selectedOption?.title ?? t.create.title} onClose={onClose}>
      {selectedType ? (
        <>
          <button type="button" className="modal-back-action" onClick={() => setSelectedType(null)}>
            <span aria-hidden="true">←</span> {t.create.backToTypes}
          </button>
          {selectedType === 'chore' && (
            <AddChoreForm
              members={members}
              currentMemberId={currentMember.id}
              initialDueDate={datePrefill?.field === 'dueDate' ? datePrefill.value : undefined}
              onSubmit={submitChore}
            />
          )}
          {selectedType === 'activity' && (
            <AddActivityForm
              members={members}
              kids={kids}
              currentMemberId={currentMember.id}
              initialStartDate={datePrefill?.field === 'startDate' ? datePrefill.value : undefined}
              onSubmit={submitActivity}
            />
          )}
          {selectedType === 'medical' && (
            <AddMedicalRecordForm
              members={members}
              currentMemberId={currentMember.id}
              initialRecordDate={datePrefill?.field === 'recordDate' ? datePrefill.value : undefined}
              onSubmit={submitMedical}
            />
          )}
          {selectedType === 'meal' && (
            <AddPlanEntryForm
              meals={meals}
              members={members}
              planEntries={planEntries}
              defaultDate={datePrefill?.field === 'entryDate' ? datePrefill.value : undefined}
              defaultSlot="dinner"
              onSubmit={submitMeal}
            />
          )}
        </>
      ) : (
        <div className="create-type-grid">
          <p className="create-type-intro">{t.create.intro}</p>
          {options.map((option, index) => {
            const style = getItemTypeStyle(option.type)
            return (
              <button
                key={option.type}
                type="button"
                className="create-type-option"
                onClick={() => setSelectedType(option.type)}
                autoFocus={index === 0}
              >
                <span className="create-type-icon" style={{ color: `var(${style.colorVar})` }}>
                  {style.icon}
                </span>
                <span className="create-type-copy">
                  <span className="create-type-title">{option.title}</span>
                  <span className="create-type-description">{option.description}</span>
                </span>
                <span className="create-type-chevron" aria-hidden="true">›</span>
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
