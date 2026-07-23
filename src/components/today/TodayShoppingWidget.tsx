import { useRef, useState } from 'react'
import { t } from '../../strings'
import type { ShoppingAddResult, ShoppingItem } from '../../utils/shopping'
import type { ShoppingSyncStatus } from '../../shopping/shoppingRepository'
import { formatLocalizedShoppingQuantity } from '../../utils/shoppingLabels'
import { TodayQuickAddField } from './TodayQuickAddField'
import { CompletionCheckbox } from '../ui/CompletionCheckbox'

const PREVIEW_LIMIT = 3

interface Props {
  items: ShoppingItem[]
  loading: boolean
  hasUsableData: boolean
  syncStatus: ShoppingSyncStatus
  onOpen: () => void
  onAddItem: (name: string) => Promise<ShoppingAddResult>
  onTogglePurchased: (id: string, purchased: boolean) => Promise<void>
}

export function TodayShoppingWidget({ items, loading, hasUsableData, syncStatus, onOpen, onAddItem, onTogglePurchased }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const preview = items.slice(0, PREVIEW_LIMIT)
  const remaining = items.length - preview.length

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const nextName = name.trim()
    if (!nextName || busy) return
    setBusy(true)
    setFeedback(null)
    setHasError(false)
    try {
      const result = await onAddItem(nextName)
      setName('')
      setFeedback(result.action === 'added' ? t.shopping.added : result.action === 'merged' ? t.shopping.merged : t.shopping.alreadyExists)
    } catch (error) {
      console.error('Failed to add a shopping item from Today:', error)
      setHasError(true)
      setFeedback(t.shopping.actionFailed)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  async function markBought(item: ShoppingItem) {
    try {
      await onTogglePurchased(item.id, true)
    } catch (error) {
      console.error('Failed to mark a shopping item as bought from Today:', error)
      setHasError(true)
      setFeedback(t.shopping.actionFailed)
      // Reuses the same mutation the full shopping list already uses to
      // un-purchase an item — the closest thing to a rollback this
      // optimistic, queue-backed mutation has.
      void onTogglePurchased(item.id, false).catch(() => undefined)
    }
  }

  return (
    <section className="page-section today-shopping-widget" aria-labelledby="today-shopping-title">
      <div className="page-section-head">
        <span className="today-shopping-heading">
          <h2 id="today-shopping-title" className="section-heading">{t.shopping.title}</h2>
          <span className="section-count">{loading || !hasUsableData ? t.shopping.loading : t.shopping.activeCount(items.length)}</span>
        </span>
        <button type="button" className="link today-shopping-open" onClick={onOpen}>
          {t.today.shoppingOpenAction}<span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="panel is-secondary is-shopping">
      <TodayQuickAddField
        value={name}
        placeholder={t.today.quickShoppingPlaceholder}
        accessibleLabel={t.today.quickShoppingLabel}
        submitLabel={t.shopping.quickAddAction}
        busy={busy}
        inputRef={inputRef}
        onChange={setName}
        onSubmit={submit}
      />

      {loading || (!hasUsableData && syncStatus === 'syncing') ? (
        <p className="today-shopping-state" role="status">{t.shopping.loading}</p>
      ) : preview.length > 0 ? (
        <ul className="today-shopping-preview" data-preview-count={preview.length}>
          {preview.map((item) => {
            const quantity = formatLocalizedShoppingQuantity(item.quantity, item.unit)
            return <li key={item.id}>
              <CompletionCheckbox checked={false} label={t.today.quickShoppingItemBought(item.name)} onClick={() => void markBought(item)} />
              <span className="today-shopping-item-name">{item.name}</span>
              {quantity && <span className="today-shopping-quantity">{quantity}</span>}
            </li>
          })}
        </ul>
      ) : hasUsableData ? (
        <p className="today-shopping-empty">{t.today.shoppingEmpty}</p>
      ) : (
        <p className="today-shopping-state warning" role="status">{syncStatus === 'offline' ? t.shopping.noOfflineData : t.shopping.dataUnavailable}</p>
      )}
      {hasUsableData && syncStatus === 'error' && <p className="today-shopping-state warning" role="status">{t.shopping.cachedSyncWarning}</p>}
      {hasUsableData && syncStatus === 'offline' && <p className="today-shopping-state offline" role="status">{t.shopping.cachedOffline}</p>}
      {remaining > 0 && <p className="today-shopping-more">{t.today.shoppingMore(remaining)}</p>}
      {feedback && <p className={`today-quick-add-feedback${hasError ? ' error' : ''}`} role={hasError ? 'alert' : 'status'}>{feedback}</p>}
      </div>
    </section>
  )
}
