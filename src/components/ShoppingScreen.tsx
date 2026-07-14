import { useMemo, useState } from 'react'
import { useFamilyData } from '../context/FamilyDataContext'
import { t } from '../strings'
import { formatShortDate } from '../utils/dueDate'
import { groupShoppingItems, shoppingItemsForCopy, type ShoppingItem, type ShoppingSession, type ShoppingTemplate } from '../utils/shopping'
import { formatLocalizedShoppingQuantity, shoppingCategoryLabel } from '../utils/shoppingLabels'
import { ShoppingCategoryIcon } from './shopping/ShoppingCategoryIcon'
import { EmptyState } from './ui/EmptyState'
import { ErrorState } from './ui/ErrorState'
import { MemberAvatar } from './ui/MemberAvatar'
import { Modal } from './ui/Modal'
import { ShoppingItemForm } from './shopping/ShoppingItemForm'

export function ShoppingScreen() {
  const {
    members, memberById, activeShoppingItems, purchasedShoppingItems, commonShoppingItems, shoppingSessions,
    shoppingLoading, shoppingError, refreshShopping, addShoppingItem, updateShoppingItem, deleteShoppingItem,
    toggleShoppingPurchased, archivePurchasedShoppingItems, importShoppingItems,
  } = useFamilyData()
  const [quickName, setQuickName] = useState('')
  const [filterResponsible, setFilterResponsible] = useState('')
  const [selectedItem, setSelectedItem] = useState<ShoppingItem | null>(null)
  const [showCommon, setShowCommon] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const filteredActive = useMemo(() => filterResponsible
    ? activeShoppingItems.filter((item) => item.responsible_member_id === filterResponsible)
    : activeShoppingItems, [activeShoppingItems, filterResponsible])
  const groups = useMemo(() => groupShoppingItems(filteredActive), [filteredActive])

  async function quickAdd(event: React.FormEvent) {
    event.preventDefault()
    if (!quickName.trim()) return
    setBusy(true)
    setFeedback(null)
    try {
      const result = await addShoppingItem({ name: quickName, quantity: null, unit: null, note: '', category: 'other', responsibleMemberId: null })
      setQuickName('')
      setFeedback(result.action === 'added' ? t.shopping.added : result.action === 'merged' ? t.shopping.merged : t.shopping.alreadyExists)
    } catch (err) { setFeedback(err instanceof Error ? err.message : String(err)) }
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

  async function copySession(session: ShoppingSession, selectedIds: Set<string>) {
    const selected = session.items.filter((item) => selectedIds.has(item.id))
    const result = await importShoppingItems(shoppingItemsForCopy(selected))
    setFeedback(t.shopping.copiedResult(result.added, result.merged, result.skipped, result.failed))
    setShowHistory(false)
  }

  if (shoppingLoading) return <p className="loading">{t.loading.generic}</p>
  if (shoppingError) return <ErrorState message={shoppingError} onRetry={refreshShopping} />

  return (
    <>
      <div className="screen-header shopping-header">
        <div><h1 className="home-title">{t.shopping.title}</h1><p className="home-subtitle">{t.shopping.activeCount(activeShoppingItems.length)}</p></div>
      </div>

      <form className="shopping-quick-add" onSubmit={quickAdd}>
        <input value={quickName} onChange={(event) => setQuickName(event.target.value)} placeholder={t.shopping.quickAddPlaceholder} aria-label={t.shopping.quickAddPlaceholder} />
        <button type="submit" disabled={busy || !quickName.trim()}><span aria-hidden="true">+</span> {t.shopping.quickAddAction}</button>
      </form>
      {feedback && <p className="shopping-feedback" role="status">{feedback}</p>}

      <div className="shopping-toolbar">
        <button type="button" className="btn-secondary" onClick={() => setShowCommon(true)}>{t.shopping.commonAction}</button>
        <button type="button" className="btn-secondary" onClick={() => setShowHistory(true)}>{t.shopping.historyAction}</button>
      </div>

      {members.length > 0 && <div className="filter-row shopping-filter"><select value={filterResponsible} onChange={(event) => setFilterResponsible(event.target.value)} aria-label={t.shopping.filterResponsible}>
        <option value="">{t.shopping.filterAll}</option>
        {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
      </select></div>}

      {activeShoppingItems.length === 0 && purchasedShoppingItems.length === 0 ? (
        <EmptyState title={t.shopping.emptyTitle} body={t.shopping.emptyBody} />
      ) : filteredActive.length === 0 ? (
        <EmptyState title={filterResponsible ? t.shopping.filterEmpty : t.shopping.activeEmpty} />
      ) : (
        <div className="shopping-category-groups">
          {groups.map((group) => <section key={group.category} className={`shopping-category shopping-category-${group.category}`}>
            <h2><ShoppingCategoryIcon category={group.category} />{shoppingCategoryLabel(group.category)}<span>{group.items.length}</span></h2>
            <ul className="shopping-list">{group.items.map((item) => <ShoppingRow key={item.id} item={item} memberById={memberById} onToggle={() => toggleShoppingPurchased(item.id, true)} onEdit={() => setSelectedItem(item)} />)}</ul>
          </section>)}
        </div>
      )}

      {purchasedShoppingItems.length > 0 && <details className="shopping-purchased">
        <summary>{t.shopping.purchasedCount(purchasedShoppingItems.length)}</summary>
        <ul className="shopping-list purchased">{purchasedShoppingItems.map((item) => <ShoppingRow key={item.id} item={item} memberById={memberById} onToggle={() => toggleShoppingPurchased(item.id, false)} onEdit={() => setSelectedItem(item)} />)}</ul>
        <button type="button" className="link" onClick={async () => { if (window.confirm(t.shopping.clearPurchasedConfirm)) await archivePurchasedShoppingItems() }}>{t.shopping.clearPurchased}</button>
      </details>}

      {selectedItem && <Modal title={t.shopping.editTitle} onClose={() => setSelectedItem(null)}><ShoppingItemForm
        initial={selectedItem} members={members}
        onSubmit={async (input) => { await updateShoppingItem(selectedItem.id, input); setSelectedItem(null) }}
        onDelete={async () => { if (window.confirm(t.shopping.deleteConfirm)) { await deleteShoppingItem(selectedItem.id); setSelectedItem(null) } }}
      /></Modal>}
      {showCommon && <CommonItemsModal items={commonShoppingItems} onAdd={addTemplate} onClose={() => setShowCommon(false)} />}
      {showHistory && <HistoryModal sessions={shoppingSessions} onCopy={copySession} onClose={() => setShowHistory(false)} />}
    </>
  )
}

function ShoppingRow({ item, memberById, onToggle, onEdit }: {
  item: ShoppingItem
  memberById: ReturnType<typeof useFamilyData>['memberById']
  onToggle: () => Promise<void>
  onEdit: () => void
}) {
  const creator = item.created_by_member_id ? memberById(item.created_by_member_id) : undefined
  const responsible = item.responsible_member_id ? memberById(item.responsible_member_id) : undefined
  const purchaser = item.purchased_by_member_id ? memberById(item.purchased_by_member_id) : undefined
  return <li className={`shopping-item${item.purchased ? ' purchased' : ''}`}>
    <button type="button" className="shopping-check" aria-pressed={item.purchased} aria-label={`${item.purchased ? t.shopping.purchasedTitle : t.shopping.activeTitle}: ${item.name}`} onClick={onToggle}><span aria-hidden="true">✓</span></button>
    <button type="button" className="shopping-item-main" onClick={onEdit}>
      <span className="shopping-item-top"><strong>{item.name}</strong>{(item.quantity !== null || item.unit) && <b>{formatLocalizedShoppingQuantity(item.quantity, item.unit)}</b>}</span>
      {item.note && <span className="shopping-item-note">{item.note}</span>}
      <span className="shopping-item-meta">
        {creator && <><MemberAvatar member={creator} size={20} /><span>{t.shopping.createdBy(creator.display_name)}</span></>}
        {responsible && <span className="shopping-responsible">{t.shopping.responsibleFor(responsible.display_name)}</span>}
        {purchaser && <span>{t.shopping.purchasedBy(purchaser.display_name)}</span>}
        {item.purchased_at && <span>{formatShortDate(item.purchased_at.slice(0, 10))}</span>}
      </span>
    </button>
  </li>
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
