import { BookOpen, ShoppingCart, Vote } from 'lucide-react'
import { useActivitiesData } from '../../context/activities/ActivitiesContext'
import { useChoresData } from '../../context/chores/ChoresContext'
import { useCreateRecord, type RecordType } from '../../context/create-record/CreateRecordContext'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../../context/family/FamilyMembersContext'
import { useFamilySettings } from '../../context/family/FamilySettingsContext'
import { useMedicalData } from '../../context/health/MedicalContext'
import { useMealsDataContext } from '../../context/meals/MealsContext'
import { useShopping } from '../../context/shopping/ShoppingContext'
import { useCalendarOffline } from '../../context/calendar/CalendarOfflineContext'
import { t } from '../../strings'
import { capabilitiesFor } from '../../utils/uiCapabilities'
import { AddActivityForm } from '../AddActivityForm'
import { AddChoreForm } from '../AddChoreForm'
import { AddMedicalRecordForm } from '../AddMedicalRecordForm'
import { AddMealForm } from '../meals/AddMealForm'
import { AddPlanEntryForm } from '../meals/AddPlanEntryForm'
import { CreateRoundForm } from '../meals/CreateRoundForm'
import { ShoppingItemForm } from '../shopping/ShoppingItemForm'
import { ItemTypeIcon } from '../ui/ItemTypeIcon'
import { Modal } from '../ui/Modal'

interface CreateOption {
  type: RecordType
  title: string
  description: string
  icon: React.ReactNode
}

function customIcon(icon: React.ReactNode, colorVar: string) {
  return <span
    className="item-type-icon"
    style={{
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: `color-mix(in srgb, var(${colorVar}) 10%, transparent)`,
      color: `var(${colorVar})`,
    }}
    aria-hidden="true"
  >{icon}</span>
}

export function CreateRecordWizard() {
  const create = useCreateRecord()
  const { currentMember } = useFamilyCore()
  const capabilities = capabilitiesFor(currentMember)
  const { members: liveMembers, kids: liveKids } = useFamilyMembersData()
  const { shoppingCategorySettings } = useFamilySettings()
  const { addChore } = useChoresData()
  const { addActivity } = useActivitiesData()
  const { addMedicalRecord } = useMedicalData()
  const { meals, planEntries, voteRounds, addMeal, addPlanEntry, createVoteRound } = useMealsDataContext()
  const { addShoppingItem } = useShopping()
  const {
    members: cachedCalendarMembers,
    addOfflineChore,
    addOfflineActivity,
    calendarSyncStatus,
    calendarSyncError,
    refreshCalendar,
  } = useCalendarOffline()
  const members = liveMembers.length > 0 ? liveMembers : cachedCalendarMembers
  const kids = liveKids.length > 0 ? liveKids : members.filter((member) => member.role === 'child')

  if (!create.isOpen || !create.context) return null

  const allOptions: CreateOption[] = [
    { type: 'household-task', title: t.create.choreTitle, description: t.create.choreDescription, icon: <ItemTypeIcon type="chore" /> },
    { type: 'activity', title: t.create.activityTitle, description: t.create.activityDescription, icon: <ItemTypeIcon type="activity" /> },
    { type: 'medical', title: t.create.medicalTitle, description: t.create.medicalDescription, icon: <ItemTypeIcon type="medical" /> },
    { type: 'meal', title: t.create.mealTitle, description: t.create.mealDescription, icon: <ItemTypeIcon type="meal" /> },
    { type: 'shopping-item', title: t.create.shoppingTitle, description: t.create.shoppingDescription, icon: customIcon(<ShoppingCart size={22} />, '--category-family') },
    { type: 'meal-library', title: t.create.mealLibraryTitle, description: t.create.mealLibraryDescription, icon: customIcon(<BookOpen size={22} />, '--category-meals') },
    { type: 'meal-vote', title: t.create.mealVoteTitle, description: t.create.mealVoteDescription, icon: customIcon(<Vote size={22} />, '--category-meals') },
  ]
  const activeVoteExists = voteRounds.some((round) => round.status === 'open' || round.status === 'draft')
  const options = capabilities.createPlannerItems
    ? allOptions.filter((option) => option.type !== 'meal-vote' || !activeVoteExists)
    : allOptions.filter((option) => option.type === 'shopping-item')
  const selectedOption = allOptions.find((option) => option.type === create.selectedType)
  const queueCalendarCreate = calendarSyncStatus !== 'synced'
  const offlineLimited = calendarSyncStatus === 'offline'
    || (calendarSyncStatus === 'error' && calendarSyncError !== 'calendar-mutation-failed')
  const offlineSupportedTypes = new Set<RecordType>(['household-task', 'activity', 'shopping-item'])
  const selectedTypeUnavailable = Boolean(offlineLimited && create.selectedType && !offlineSupportedTypes.has(create.selectedType))
  const selectedMemberId = create.context.memberId && members.some((member) => member.id === create.context?.memberId)
    ? create.context.memberId
    : undefined
  const mealSlot = ['breakfast', 'snack', 'lunch', 'dinner'].includes(create.context.section ?? '')
    ? create.context.section as 'breakfast' | 'snack' | 'lunch' | 'dinner'
    : 'dinner'
  const formKey = `${create.token}:${create.selectedType}`

  return <Modal
    title={selectedOption?.title ?? t.create.title}
    onClose={() => { create.closeCreateRecord() }}
    closeOnBackdrop={false}
    size="fullscreen"
    className="create-record-wizard"
  >
    {create.selectedType ? <>
      <button
        type="button"
        className="modal-back-action create-record-back"
        onClick={create.backToRecordTypes}
        disabled={create.status === 'submitting'}
      >
        <span aria-hidden="true">←</span> {t.create.backToTypes}
      </button>
      {create.error && <p className="error create-record-error" role="alert">{create.error}</p>}
      {selectedTypeUnavailable && <p className="info-note" role="status">{t.calendar.offlineCreateUnsupported}</p>}
      <div
        className="create-record-form-body"
        onChangeCapture={create.markDirty}
        onInputCapture={create.markDirty}
        onClickCapture={(event) => {
          const button = (event.target as HTMLElement).closest('button')
          if (!button || button.dataset.createIgnoreDirty !== undefined || button.type === 'submit') return
          create.markDirty()
        }}
      >
        {!selectedTypeUnavailable && create.selectedType === 'household-task' && <AddChoreForm
          key={formKey}
          members={members}
          currentMemberId={currentMember.id}
          initialTitle={create.context.initialTitle}
          initialDueDate={create.context.date}
          initialMemberId={selectedMemberId}
          variant="guided"
          onSubmit={(input) => create.runCreate(async () => {
            if (queueCalendarCreate) return addOfflineChore(input)
            await addChore(input)
            await refreshCalendar()
          })}
        />}
        {!selectedTypeUnavailable && create.selectedType === 'activity' && <AddActivityForm
          key={formKey}
          members={members}
          kids={kids}
          initialTitle={create.context.initialTitle}
          initialStartDate={create.context.date}
          initialMemberId={selectedMemberId}
          variant="guided"
          onSubmit={(input) => create.runCreate(async () => {
            if (queueCalendarCreate) return addOfflineActivity(input)
            await addActivity(input)
            await refreshCalendar()
          })}
        />}
        {!selectedTypeUnavailable && create.selectedType === 'medical' && <AddMedicalRecordForm
          key={formKey}
          members={members}
          currentMemberId={currentMember.id}
          initialRecordDate={create.context.date}
          initialMemberId={selectedMemberId}
          variant="guided"
          onSubmit={(input) => create.runCreate(() => addMedicalRecord(input))}
        />}
        {!selectedTypeUnavailable && create.selectedType === 'meal' && <AddPlanEntryForm
          key={formKey}
          meals={meals}
          members={members}
          planEntries={planEntries}
          defaultDate={create.context.date}
          defaultSlot={mealSlot}
          initialMemberId={selectedMemberId}
          prefill={create.context.mealId || create.context.initialTitle
            ? { mealId: create.context.mealId ?? null, title: create.context.initialTitle ?? '' }
            : undefined}
          variant="guided"
          onSubmit={(input) => create.runCreate(() => addPlanEntry(input))}
        />}
        {!selectedTypeUnavailable && create.selectedType === 'shopping-item' && <ShoppingItemForm
          key={formKey}
          initialName={create.context.initialTitle}
          initialMemberId={selectedMemberId}
          members={members}
          categorySettings={shoppingCategorySettings}
          variant="guided"
          onSubmit={(input) => create.runCreate(() => addShoppingItem(input))}
        />}
        {!selectedTypeUnavailable && create.selectedType === 'meal-library' && <AddMealForm
          key={formKey}
          initialName={create.context.initialTitle}
          variant="guided"
          onSubmit={(input) => create.runCreate(() => addMeal(input))}
        />}
        {!selectedTypeUnavailable && create.selectedType === 'meal-vote' && <CreateRoundForm
          key={formKey}
          meals={meals}
          initialMealId={create.context.mealId}
          variant="guided"
          onSubmit={(input, openImmediately) => create.runCreate(() => createVoteRound(input, openImmediately))}
        />}
      </div>
    </> : <div className="create-type-grid" aria-describedby="create-record-intro">
      <p id="create-record-intro" className="create-type-intro">{t.create.intro}</p>
      {options.map((option, index) => <button
        key={option.type}
        type="button"
        className="create-type-option"
        disabled={offlineLimited && !offlineSupportedTypes.has(option.type)}
        onClick={() => create.selectRecordType(option.type)}
        autoFocus={index === 0}
      >
        {option.icon}
        <span className="create-type-copy">
          <span className="create-type-title">{option.title}</span>
          <span className="create-type-description">{option.description}</span>
          {offlineLimited && !offlineSupportedTypes.has(option.type) && <span className="row-meta">{t.calendar.offlineUnavailableBadge}</span>}
        </span>
        <span className="create-type-chevron" aria-hidden="true">›</span>
      </button>)}
    </div>}
  </Modal>
}
