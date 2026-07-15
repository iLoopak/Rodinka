import { useRef, useState } from 'react'
import { t } from '../../strings'
import type { ShoppingAddResult, ShoppingItem } from '../../utils/shopping'
import { formatLocalizedShoppingQuantity } from '../../utils/shoppingLabels'
import { ShoppingCategoryIcon } from '../shopping/ShoppingCategoryIcon'
import { TodayQuickAddField } from './TodayQuickAddField'

const PREVIEW_LIMIT = 3

interface Props {
  items: ShoppingItem[]
  onOpen: () => void
  onAddItem: (name: string) => Promise<ShoppingAddResult>
}

export function TodayShoppingWidget({ items, onOpen, onAddItem }: Props) {
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
      setHasError(true)
      setFeedback(error instanceof Error ? error.message : t.errors.generic)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <section className="section today-shopping-widget" aria-labelledby="today-shopping-title">
      <div className="today-shopping-header">
        <span className="today-shopping-icon" aria-hidden="true">
          <ShoppingCategoryIcon category="household" />
        </span>
        <span className="today-shopping-heading">
          <h2 id="today-shopping-title">{t.shopping.title}</h2>
          <span>{t.shopping.activeCount(items.length)}</span>
        </span>
        <button type="button" className="link today-shopping-open" onClick={onOpen}>
          {t.today.shoppingOpenAction}<span aria-hidden="true">›</span>
        </button>
      </div>

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

      {preview.length > 0 ? (
        <ul className="today-shopping-preview" data-preview-count={preview.length}>
          {preview.map((item) => {
            const quantity = formatLocalizedShoppingQuantity(item.quantity, item.unit)
            return <li key={item.id}>
              <span className="today-shopping-dot" aria-hidden="true" />
              <span className="today-shopping-item-name">{item.name}</span>
              {quantity && <span className="today-shopping-quantity">{quantity}</span>}
            </li>
          })}
        </ul>
      ) : (
        <p className="today-shopping-empty">{t.today.shoppingEmpty}</p>
      )}
      {remaining > 0 && <p className="today-shopping-more">{t.today.shoppingMore(remaining)}</p>}
      {feedback && <p className={`today-quick-add-feedback${hasError ? ' error' : ''}`} role={hasError ? 'alert' : 'status'}>{feedback}</p>}
    </section>
  )
}
