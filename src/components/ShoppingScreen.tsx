import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import { useFamilyCore } from '../context/family/FamilyCoreContext'
import { useFamilyMembersData } from '../context/family/FamilyMembersContext'
import { useFamilySettings } from '../context/family/FamilySettingsContext'
import { useShopping } from '../context/shopping/ShoppingContext'
import { t } from '../strings'
import { formatShortDate } from '../utils/dueDate'
import { SHOPPING_CATEGORIES, groupShoppingItems, shoppingItemsForCopy, type ShoppingCategory, type ShoppingItem, type ShoppingSession, type ShoppingTemplate } from '../utils/shopping'
import { insertIdBefore } from '../utils/listReorder'
import { formatLocalizedShoppingQuantity, shoppingCategoryLabel } from '../utils/shoppingLabels'
import { ShoppingCategoryIcon } from './shopping/ShoppingCategoryIcon'
import { EmptyState } from './ui/EmptyState'
import { ErrorState } from './ui/ErrorState'
import { MemberAvatar } from './ui/MemberAvatar'
import { Modal } from './ui/Modal'
import { ConfirmDestructiveActionDialog, UndoToast } from './ui/DestructiveActions'
import { ShoppingItemForm } from './shopping/ShoppingItemForm'
import { ShareToChatButton } from './messages/ShareToChatButton'
import { CompletionCheckbox } from './ui/CompletionCheckbox'
import { defaultShoppingCategorySettings, type ShoppingCategorySettings } from '../utils/shoppingCategorySettings'
import { ScreenHeader } from './ui/ScreenHeader'
import { FilterDisclosure, FilterDisclosurePanel, FilterDisclosureToggle } from './ui/FilterDisclosure'
import { GripVertical } from 'lucide-react'

export function ShoppingScreen() {
  const { currentMember, isParentOrAdmin } = useFamilyCore()
  const { members, memberById } = useFamilyMembersData()
  const { shoppingCategorySettings, updateShoppingCategorySettings } = useFamilySettings()
  const {
    activeShoppingItems, purchasedShoppingItems, commonShoppingItems, shoppingSessions,
    shoppingLoading, shoppingError, refreshShopping, addShoppingItem, updateShoppingItem, deleteShoppingItem,
    toggleShoppingPurchased, archivePurchasedShoppingItems, importShoppingItems,
    reorderShoppingItems,
    shoppingSyncStatus, pendingShoppingChanges, pendingShoppingItemIds, shoppingLastSyncedAt,
    failedShoppingMutations, retryShoppingMutation, discardShoppingMutation,
  } = useShopping()
  const [quickName, setQuickName] = useState('')
  const [filterResponsible, setFilterResponsible] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('assignedTo') === 'me' ? currentMember.id : '')
  const [selectedItem, setSelectedItem] = useState<ShoppingItem | null>(null)
  const [showCommon, setShowCommon] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showCategorySettings, setShowCategorySettings] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncRetrying, setSyncRetrying] = useState(false)
  const [confirmClearPurchased, setConfirmClearPurchased] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ShoppingItem | null>(null)
  const deleteTimerRef = useRef<number | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  useEffect(() => () => {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const visibleActiveItems = useMemo(() => pendingDelete ? activeShoppingItems.filter((item) => item.id !== pendingDelete.id) : activeShoppingItems, [activeShoppingItems, pendingDelete])
  const filteredActive = useMemo(() => filterResponsible
    ? visibleActiveItems.filter((item) => item.responsible_member_id === filterResponsible)
    : visibleActiveItems, [visibleActiveItems, filterResponsible])
  const childSafeActive = isParentOrAdmin ? filteredActive : visibleActiveItems
  const groups = useMemo(() => groupShoppingItems(childSafeActive, isParentOrAdmin && draggedItemId !== null), [childSafeActive, draggedItemId, isParentOrAdmin])

  async function saveShoppingOrder(movedId: string, category: ShoppingCategory, orderedIds: string[]) {
    setFeedback(null)
    try {
      await reorderShoppingItems(movedId, category, orderedIds)
    } catch (error) {
      console.error('Failed to reorder shopping item:', error)
      setFeedback(t.shopping.actionFailed)
    }
  }

  function handleShoppingDragEnd(event: DragEndEvent) {
    setDraggedItemId(null)
    const movedId = String(event.active.id)
    const movedItem = visibleActiveItems.find((item) => item.id === movedId)
    if (!movedItem || !event.over) return
    const overData = event.over.data.current as { type?: string; category?: ShoppingCategory } | undefined
    const targetCategory = overData?.category
    if (!targetCategory) return
    const targetId = overData.type === 'item' ? String(event.over.id) : null
    if (movedItem.category === targetCategory && targetId === movedId) return
    const targetIds = visibleActiveItems.filter((item) => item.category === targetCategory).map((item) => item.id)
    const orderedIds = movedItem.category === targetCategory && targetId
      ? arrayMove(targetIds, targetIds.indexOf(movedId), targetIds.indexOf(targetId))
      : insertIdBefore(targetIds, movedId, targetId)
    void saveShoppingOrder(movedId, targetCategory, orderedIds)
  }

  async function quickAdd(event: React.FormEvent) {
    event.preventDefault()
    if (!quickName.trim()) return
    setBusy(true)
    setFeedback(null)
    try {
      const result = await addShoppingItem({ name: quickName, quantity: null, unit: null, note: '', category: 'other', responsibleMemberId: null })
      setQuickName('')
      setFeedback(result.action === 'added' ? t.shopping.added : result.action === 'merged' ? t.shopping.merged : t.shopping.alreadyExists)
    } catch (error) {
      console.error('Failed to add shopping item:', error)
      setFeedback(t.shopping.actionFailed)
    }
    finally { setBusy(false) }
  }

  async function addTemplate(template: ShoppingTemplate) {
    const result = await addShoppingItem({
      name: template.name, quantity: template.quantity, unit: template.unit, note: template.note,
      category: template.category, responsibleMemberId: null,
    })
    setFeedback(result.action === 'added' ? t.shopping.added : result.action === 'merged' ? t.shopping.merged : t.shopping.alreadyExists)
    setShowCommon(false)
  }

  function scheduleDeleteShoppingItem(item: ShoppingItem) {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current)
    setPendingDelete(item)
    setSelectedItem(null)
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null
      void deleteShoppingItem(item.id).catch((error) => {
        console.error('Failed to delete shopping item:', error)
        setFeedback(t.shopping.actionFailed)
      })
      setPendingDelete(null)
    }, 5000)
  }

  function undoDeleteShoppingItem() {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current)
    deleteTimerRef.current = null
    setPendingDelete(null)
  }

  async function copySession(session: ShoppingSession, selectedIds: Set<string>) {
    const selected = session.items.filter((item) => selectedIds.has(item.id))
    const result = await importShoppingItems(shoppingItemsForCopy(selected))
    setFeedback(t.shopping.copiedResult(result.added, result.merged, result.skipped, result.failed))
    setShowHistory(false)
  }

  async function retrySync() {
    if (syncRetrying) return
    setSyncRetrying(true)
    try { await refreshShopping() } finally { setSyncRetrying(false) }
  }

  if (shoppingLoading) return <p className="loading">{t.loading.generic}</p>
  if (shoppingError) return <ErrorState message={t.shopping.dataUnavailable} onRetry={refreshShopping} />

  return (
    <>
      <FilterDisclosure id="shopping-tools-panel" open={toolsOpen} onOpenChange={setToolsOpen}
        activeCount={Number(Boolean(filterResponsible))} onClear={() => setFilterResponsible('')} label={t.shopping.toolsLabel}
        showLabel={t.shopping.showTools} hideLabel={t.shopping.hideTools}>
      <ScreenHeader className="shopping-header" title={t.shopping.title} subtitle={t.shopping.activeCount(visibleActiveItems.length)}
        actions={<>
          {isParentOrAdmin && <FilterDisclosureToggle />}
        </>} />

      <form className="shopping-quick-add" onSubmit={quickAdd}>
        <input value={quickName} onChange={(event) => setQuickName(event.target.value)} placeholder={t.shopping.quickAddPlaceholder} aria-label={t.shopping.quickAddPlaceholder} />
        <button type="submit" disabled={busy || !quickName.trim()}><span aria-hidden="true">+</span> {t.shopping.quickAddAction}</button>
      </form>
      {feedback && <p className="shopping-feedback" role="status">{feedback}</p>}
      {(shoppingSyncStatus !== 'synced' || shoppingLastSyncedAt) && <div
        className={`shopping-sync-status ${shoppingSyncStatus}`}
        role={shoppingSyncStatus === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        <span className="shopping-sync-status-dot" aria-hidden="true" />
        <span>{shoppingSyncStatus === 'offline'
          ? t.shopping.syncOffline
          : shoppingSyncStatus === 'syncing'
            ? t.shopping.syncing(pendingShoppingChanges)
            : shoppingSyncStatus === 'error'
              ? t.shopping.syncFailed
              : t.shopping.syncComplete}</span>
        {shoppingSyncStatus === 'error' && <button type="button" className="link" disabled={syncRetrying} onClick={() => void retrySync()}>{syncRetrying ? t.errors.retrying : t.shopping.syncRetry}</button>}
      </div>}

      {/* A mutation the server rejected outright. Retrying it on a timer would
          never help, so it is surfaced with the two actions that can actually
          resolve it. Editing the item also clears it, by folding into the
          queued mutation. */}
      {failedShoppingMutations.length > 0 && <div className="shopping-sync-blocked" role="alert">
        <span>{t.shopping.syncBlocked(failedShoppingMutations.length)}</span>
        <div className="shopping-sync-blocked-actions">
          <button type="button" className="link" onClick={() => void retryShoppingMutation()}>{t.shopping.syncBlockedRetry}</button>
          {failedShoppingMutations.map((mutation) => (
            <button
              key={mutation.mutationId}
              type="button"
              className="link"
              onClick={() => void discardShoppingMutation(mutation.itemId)}
            >{t.shopping.syncBlockedDiscard}</button>
          ))}
        </div>
      </div>}

      {isParentOrAdmin && <FilterDisclosurePanel>
      <div className="shopping-tools-panel">
        <div className="shopping-toolbar">
          <button type="button" className="btn-secondary" onClick={() => setShowCommon(true)}>{t.shopping.commonAction}</button>
          <button type="button" className="btn-secondary" onClick={() => setShowHistory(true)}>{t.shopping.historyAction}</button>
          {isParentOrAdmin && <button type="button" className="btn-secondary" onClick={() => setShowCategorySettings(true)}>{t.shopping.sectionsAction}</button>}
        </div>
        {members.length > 0 && <div className="filter-row shopping-filter">
          <select value={filterResponsible} onChange={(event) => setFilterResponsible(event.target.value)} aria-label={t.shopping.filterResponsible}>
            <option value="">{t.shopping.filterResponsible}: {t.shopping.filterAll}</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
          </select>
          {filterResponsible && <button type="button" className="link shopping-filter-clear" onClick={() => setFilterResponsible('')}>{t.shopping.clearFilter}</button>}
        </div>}
      </div>
      </FilterDisclosurePanel>}
      </FilterDisclosure>

      {visibleActiveItems.length === 0 && purchasedShoppingItems.length === 0 ? (
        <EmptyState title={t.shopping.emptyTitle} body={t.shopping.emptyBody} />
      ) : childSafeActive.length === 0 ? (
        <EmptyState
          title={filterResponsible ? t.shopping.filterEmpty : t.shopping.activeEmpty}
          action={filterResponsible ? { label: t.shopping.clearFilter, onClick: () => setFilterResponsible('') } : undefined}
        />
      ) : isParentOrAdmin ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setDraggedItemId(String(event.active.id))}
          onDragCancel={() => setDraggedItemId(null)}
          onDragEnd={handleShoppingDragEnd}
        >
          <div className="panel is-primary shopping-category-groups">
            {groups.map((group) => <ShoppingSortableGroup
              key={group.category}
              group={group}
              appearance={shoppingCategorySettings[group.category]}
              memberById={memberById}
              pendingItemIds={pendingShoppingItemIds}
              onToggle={toggleShoppingPurchased}
              onEdit={setSelectedItem}
            />)}
          </div>
          <DragOverlay modifiers={[snapCenterToCursor]}>
            {draggedItemId && visibleActiveItems.find((item) => item.id === draggedItemId) && (() => {
              const item = visibleActiveItems.find((candidate) => candidate.id === draggedItemId)!
              return <div className="list-drag-preview quick-todo-drag-overlay">
                <GripVertical className="list-drag-preview-handle" size={20} aria-hidden="true" />
                <span className="list-drag-preview-copy"><strong>{item.name}</strong><small>{formatLocalizedShoppingQuantity(item.quantity, item.unit)}</small></span>
              </div>
            })()}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="panel is-primary shopping-category-groups">
          {groups.map((group) => <ShoppingStaticGroup
            key={group.category}
            group={group}
            appearance={shoppingCategorySettings[group.category]}
            memberById={memberById}
            pendingItemIds={pendingShoppingItemIds}
            onToggle={toggleShoppingPurchased}
          />)}
        </div>
      )}

      {purchasedShoppingItems.length > 0 && <details className="shopping-purchased">
        <summary>{t.shopping.purchasedCount(purchasedShoppingItems.length)}</summary>
        <ul className="shopping-list purchased">{purchasedShoppingItems.map((item) => <ShoppingRow key={item.id} item={item} memberById={memberById} pending={pendingShoppingItemIds.has(item.id)} onToggle={() => toggleShoppingPurchased(item.id, false)} onEdit={isParentOrAdmin ? () => setSelectedItem(item) : undefined} />)}</ul>
        {isParentOrAdmin && <button type="button" className="link danger-action" onClick={() => setConfirmClearPurchased(true)}>{t.shopping.clearPurchased}</button>}
      </details>}

      {isParentOrAdmin && selectedItem && <Modal title={t.shopping.editTitle} onClose={() => setSelectedItem(null)}>
        <ShoppingItemForm
          initial={selectedItem} members={members} categorySettings={shoppingCategorySettings}
          onSubmit={async (input) => { await updateShoppingItem(selectedItem.id, input); setSelectedItem(null) }}
          onDelete={async () => scheduleDeleteShoppingItem(selectedItem)}
        />
        <div className="family-actions">
          <ShareToChatButton entityType="shopping_item" entityId={selectedItem.id} label={selectedItem.name} />
        </div>
      </Modal>}
      {pendingDelete && <UndoToast message={t.shopping.removedWithUndo(pendingDelete.name)} onUndo={undoDeleteShoppingItem} />}
      <ConfirmDestructiveActionDialog
        open={confirmClearPurchased}
        title={t.shopping.clearPurchasedConfirm}
        explanation={t.shopping.clearPurchasedExplanation}
        confirmLabel={t.shopping.clearPurchasedAction}
        onCancel={() => setConfirmClearPurchased(false)}
        onConfirm={async () => { await archivePurchasedShoppingItems(); setConfirmClearPurchased(false) }}
      />
      {isParentOrAdmin && showCommon && <CommonItemsModal items={commonShoppingItems} onAdd={addTemplate} onClose={() => setShowCommon(false)} />}
      {isParentOrAdmin && showHistory && <HistoryModal sessions={shoppingSessions} onCopy={copySession} onClose={() => setShowHistory(false)} />}
      {showCategorySettings && <ShoppingCategorySettingsModal
        settings={shoppingCategorySettings}
        onSave={async (settings) => {
          await updateShoppingCategorySettings(settings)
          setFeedback(t.shopping.sectionsSaved)
          setShowCategorySettings(false)
        }}
        onClose={() => setShowCategorySettings(false)}
      />}
    </>
  )
}

function ShoppingSortableGroup({ group, appearance, memberById, pendingItemIds, onToggle, onEdit }: {
  group: ReturnType<typeof groupShoppingItems>[number]
  appearance: ShoppingCategorySettings[ShoppingCategory]
  memberById: ReturnType<typeof useFamilyMembersData>['memberById']
  pendingItemIds: Set<string>
  onToggle: (itemId: string, purchased: boolean) => Promise<void>
  onEdit: (item: ShoppingItem) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `shopping-category:${group.category}`,
    data: { type: 'category', category: group.category },
  })
  return <section
    ref={setNodeRef}
    data-shopping-category={group.category}
    className={`shopping-category shopping-category-${group.category}${isOver ? ' drop-enabled' : ''}`}
    style={{
      '--shopping-accent': appearance.color,
      '--shopping-soft': `color-mix(in srgb, ${appearance.color} 11%, white)`,
      '--shopping-border': `color-mix(in srgb, ${appearance.color} 34%, white)`,
    } as CSSProperties}
  >
    <h2><ShoppingCategoryIcon category={group.category} />{appearance.label ?? shoppingCategoryLabel(group.category)}<span>{group.items.length}</span></h2>
    <SortableContext items={group.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
      <ul className="shopping-list">{group.items.map((item) => <SortableShoppingRow
        key={item.id}
        item={item}
        memberById={memberById}
        pending={pendingItemIds.has(item.id)}
        onToggle={() => onToggle(item.id, true)}
        onEdit={() => onEdit(item)}
      />)}</ul>
    </SortableContext>
    {group.items.length === 0 && <p className="shopping-drop-empty">{t.shopping.dropHere}</p>}
  </section>
}

function ShoppingStaticGroup({ group, appearance, memberById, pendingItemIds, onToggle }: {
  group: ReturnType<typeof groupShoppingItems>[number]
  appearance: ShoppingCategorySettings[ShoppingCategory]
  memberById: ReturnType<typeof useFamilyMembersData>['memberById']
  pendingItemIds: Set<string>
  onToggle: (itemId: string, purchased: boolean) => Promise<void>
}) {
  return <section
    data-shopping-category={group.category}
    className={`shopping-category shopping-category-${group.category}`}
    style={{
      '--shopping-accent': appearance.color,
      '--shopping-soft': `color-mix(in srgb, ${appearance.color} 11%, white)`,
      '--shopping-border': `color-mix(in srgb, ${appearance.color} 34%, white)`,
    } as CSSProperties}
  >
    <h2><ShoppingCategoryIcon category={group.category} />{appearance.label ?? shoppingCategoryLabel(group.category)}<span>{group.items.length}</span></h2>
    <ul className="shopping-list">{group.items.map((item) => <ShoppingRow
      key={item.id}
      item={item}
      memberById={memberById}
      pending={pendingItemIds.has(item.id)}
      onToggle={() => onToggle(item.id, true)}
    />)}</ul>
  </section>
}

function SortableShoppingRow(props: Omit<ShoppingRowProps, 'sortable'>) {
  const sortable = useSortable({ id: props.item.id, data: { type: 'item', category: props.item.category } })
  return <ShoppingRow {...props} sortable={sortable} />
}

interface ShoppingRowProps {
  item: ShoppingItem
  memberById: ReturnType<typeof useFamilyMembersData>['memberById']
  pending: boolean
  onToggle: () => Promise<void>
  onEdit?: () => void
  sortable?: ReturnType<typeof useSortable>
}

function ShoppingRow({ item, memberById, pending, onToggle, onEdit, sortable }: ShoppingRowProps) {
  const creator = item.created_by_member_id ? memberById(item.created_by_member_id) : undefined
  const responsible = item.responsible_member_id ? memberById(item.responsible_member_id) : undefined
  const purchaser = item.purchased_by_member_id ? memberById(item.purchased_by_member_id) : undefined
  const rowStyle: CSSProperties | undefined = sortable ? {
    transform: sortable.isDragging ? undefined : CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  } : undefined
  // The row is a fixed three-column grid whose first column is the drag
  // handle. A child never gets a handle (nothing is reorderable for them), so
  // the grid has to lose that column or the name is squeezed into the 44px
  // checkbox track and wraps one character per line.
  const dragHandle = item.purchased ? undefined : sortable
  const mainContent = <>
    <span className="shopping-item-top"><strong>{item.name}</strong>{pending && <span className="shopping-item-pending" title={t.shopping.pendingSync}><span className="sr-only">{t.shopping.pendingSync}</span></span>}{(item.quantity !== null || item.unit) && <b>{formatLocalizedShoppingQuantity(item.quantity, item.unit)}</b>}</span>
    {item.note && <span className="shopping-item-note">{item.note}</span>}
    <span className="shopping-item-meta">
      {creator && <><MemberAvatar member={creator} size={20} /><span>{t.shopping.createdBy(creator.display_name)}</span></>}
      {responsible && <span className="shopping-responsible">{t.shopping.responsibleFor(responsible.display_name)}</span>}
      {purchaser && <span>{t.shopping.purchasedBy(purchaser.display_name)}</span>}
      {item.purchased_at && <span>{formatShortDate(item.purchased_at.slice(0, 10))}</span>}
    </span>
  </>
  return <li
    ref={sortable?.setNodeRef}
    className={`shopping-item${item.purchased ? ' purchased' : ''}${dragHandle ? '' : ' no-drag-handle'}${sortable?.isDragging ? ' dragging' : ''}`}
    data-shopping-item-id={item.id}
    style={rowStyle}
  >
    {dragHandle && <button
      type="button"
      className="list-drag-handle"
      aria-label={t.shopping.dragItem(item.name)}
      {...dragHandle.attributes}
      {...dragHandle.listeners}
    ><GripVertical size={20} aria-hidden="true" /></button>}
    <CompletionCheckbox checked={item.purchased} label={`${item.purchased ? t.shopping.purchasedTitle : t.shopping.activeTitle}: ${item.name}`} onClick={onToggle} />
    {onEdit ? <button type="button" className="shopping-item-main" onClick={onEdit}>{mainContent}</button>
      : <span className="shopping-item-main">{mainContent}</span>}
  </li>
}

function ShoppingCategorySettingsModal({ settings, onSave, onClose }: {
  settings: ShoppingCategorySettings
  onSave: (settings: ShoppingCategorySettings) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ShoppingCategorySettings>(() => structuredClone(settings))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
    } catch (reason) {
      console.error('Failed to save shopping category settings:', reason)
      setError(t.shopping.actionFailed)
      setSaving(false)
    }
  }

  return <Modal title={t.shopping.sectionsTitle} onClose={onClose}>
    <form className="shopping-category-settings" onSubmit={submit}>
      <p className="form-hint">{t.shopping.sectionsBody}</p>
      <div className="shopping-category-settings-list">
        {SHOPPING_CATEGORIES.map((category) => <div className="shopping-category-setting" key={category}>
          <span className="shopping-category-color-preview" style={{ backgroundColor: draft[category].color }} aria-hidden="true" />
          <label>
            <span>{t.shopping.sectionNameLabel}</span>
            <input
              value={draft[category].label ?? ''}
              placeholder={shoppingCategoryLabel(category)}
              maxLength={40}
              onChange={(event) => setDraft((current) => ({
                ...current,
                [category]: { ...current[category], label: event.target.value || null },
              }))}
            />
          </label>
          <label className="shopping-category-color-field">
            <span>{t.shopping.sectionColorLabel}</span>
            <input
              type="color"
              value={draft[category].color}
              aria-label={`${t.shopping.sectionColorLabel}: ${draft[category].label ?? shoppingCategoryLabel(category)}`}
              onChange={(event) => setDraft((current) => ({
                ...current,
                [category]: { ...current[category], color: event.target.value.toUpperCase() },
              }))}
            />
          </label>
        </div>)}
      </div>
      <div className="form-actions shopping-category-settings-actions">
        <button type="submit" disabled={saving}>{saving ? t.shopping.sectionsSaving : t.shopping.sectionsSave}</button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={() => setDraft(defaultShoppingCategorySettings())}>{t.shopping.sectionsReset}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </Modal>
}

function CommonItemsModal({ items, onAdd, onClose }: { items: ShoppingTemplate[]; onAdd: (item: ShoppingTemplate) => Promise<void>; onClose: () => void }) {
  return <Modal title={t.shopping.commonTitle} onClose={onClose}>{items.length === 0 ? <EmptyState title={t.shopping.commonEmpty} /> : <ul className="shopping-template-list">{items.map((item) => <li key={item.key}><span><strong>{item.name}</strong><small>{shoppingCategoryLabel(item.category)}{item.quantity !== null || item.unit ? ` · ${formatLocalizedShoppingQuantity(item.quantity, item.unit)}` : ''}</small></span><button type="button" onClick={() => onAdd(item)}>+ {t.shopping.quickAddAction}</button></li>)}</ul>}</Modal>
}

function HistoryModal({ sessions, onCopy, onClose }: { sessions: ShoppingSession[]; onCopy: (session: ShoppingSession, ids: Set<string>) => Promise<void>; onClose: () => void }) {
  const [session, setSession] = useState<ShoppingSession | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  if (!session) return <Modal title={t.shopping.historyTitle} onClose={onClose}>{sessions.length === 0 ? <EmptyState title={t.shopping.historyEmpty} /> : <ul className="shopping-template-list">{sessions.map((entry) => <li key={entry.key}><span><strong>{formatShortDate(entry.key)}</strong><small>{entry.items.length} · {entry.items.map((item) => item.name).slice(0, 3).join(', ')}</small></span><button type="button" className="btn-secondary" onClick={() => { setSession(entry); setSelected(new Set(entry.items.map((item) => item.id))) }}>{t.shopping.copySelected}</button></li>)}</ul>}</Modal>
  return <Modal title={formatShortDate(session.key)} onClose={() => setSession(null)}><div className="shopping-copy-picker">{session.items.map((item) => <label key={item.id} className="checkbox-label"><input type="checkbox" checked={selected.has(item.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })} />{item.name}{item.quantity !== null || item.unit ? ` · ${formatLocalizedShoppingQuantity(item.quantity, item.unit)}` : ''}</label>)}</div><button type="button" disabled={selected.size === 0} onClick={() => onCopy(session, selected)}>{t.shopping.copySelected}</button></Modal>
}
