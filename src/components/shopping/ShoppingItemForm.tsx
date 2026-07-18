import { useState } from 'react'
import { t } from '../../strings'
import { SHOPPING_CATEGORIES, SHOPPING_UNITS, validateShoppingInput, type ShoppingItem, type ShoppingItemInput, type ShoppingCategory, type ShoppingUnit } from '../../utils/shopping'
import { shoppingCategoryLabel, shoppingUnitLabel } from '../../utils/shoppingLabels'
import type { FamilyMember } from '../../hooks/useFamilyMembers'
import type { ShoppingCategorySettings } from '../../utils/shoppingCategorySettings'
import { DestructiveIconButton } from '../ui/DestructiveActions'
import { GuidedDisclosure, GuidedLead, MemberChoicePicker } from '../create-record/GuidedCreateFields'

interface Props {
  initial?: ShoppingItem
  /** Prefill the name when creating from elsewhere (e.g. a chat message). Ignored when `initial` is given. */
  initialName?: string
  initialMemberId?: string
  members: FamilyMember[]
  categorySettings?: ShoppingCategorySettings
  variant?: 'standard' | 'guided'
  onSubmit: (input: ShoppingItemInput) => Promise<void>
  onDelete?: () => Promise<void>
}

export function ShoppingItemForm({ initial, initialName, initialMemberId, members, categorySettings, variant = 'standard', onSubmit, onDelete }: Props) {
  const [name, setName] = useState(initial?.name ?? initialName ?? '')
  const [quantity, setQuantity] = useState(initial?.quantity === null || initial?.quantity === undefined ? '' : String(initial.quantity))
  const [unit, setUnit] = useState<ShoppingUnit | ''>(initial?.unit ?? '')
  const [category, setCategory] = useState<ShoppingCategory>(initial?.category ?? 'other')
  const [note, setNote] = useState(initial?.note ?? '')
  const contextualMemberId = initialMemberId && members.some((member) => member.id === initialMemberId) ? initialMemberId : ''
  const [responsibleMemberId, setResponsibleMemberId] = useState(initial?.responsible_member_id ?? contextualMemberId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const input: ShoppingItemInput = {
      name,
      quantity: quantity === '' ? null : Number(quantity),
      unit: unit || null,
      note,
      category,
      responsibleMemberId: responsibleMemberId || null,
    }
    const invalid = validateShoppingInput(input)
    if (invalid) {
      setError(invalid === 'name' ? t.shopping.errors.nameRequired : t.shopping.errors.quantityInvalid)
      return
    }
    setBusy(true)
    setError(null)
    try { await onSubmit(input) }
    catch (error) {
      console.error('Failed to save shopping item:', error)
      setError(t.shopping.actionFailed)
    }
    finally { setBusy(false) }
  }

  if (variant === 'guided' && !initial) {
    return <form className="guided-create-form" onSubmit={handleSubmit}>
      <div className="guided-create-scroll">
        <GuidedLead />
        <section className="guided-primary-section">
          <label className="guided-hero-field">
            <span>{t.create.guided.shoppingPrompt}</span>
            <input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder={t.shopping.quickAddPlaceholder} />
          </label>
          <div className="guided-quantity-row">
            <label>
              <span>{t.create.guided.shoppingQuantity}</span>
              <input type="number" min="0.001" step="any" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label>
              <span>{t.shopping.unitLabel}</span>
              <select value={unit} onChange={(event) => setUnit(event.target.value as ShoppingUnit | '')}>
                <option value="">{t.shopping.unitNone}</option>
                {SHOPPING_UNITS.map((value) => <option key={value} value={value}>{shoppingUnitLabel(value)}</option>)}
              </select>
            </label>
          </div>
        </section>

        <GuidedDisclosure open={detailsOpen} onToggle={() => setDetailsOpen((open) => !open)}>
          <fieldset className="guided-choice-fieldset">
            <legend>{t.shopping.categoryLabel}</legend>
            <div className="guided-option-grid compact">
              {SHOPPING_CATEGORIES.map((value) => <button
                key={value}
                type="button"
                className={category === value ? 'selected' : ''}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >{categorySettings?.[value].label ?? shoppingCategoryLabel(value)}</button>)}
            </div>
          </fieldset>
          <MemberChoicePicker label={t.shopping.responsibleLabel} members={members} value={responsibleMemberId} emptyLabel={t.shopping.responsibleAnyone} onChange={setResponsibleMemberId} />
          <label><span>{t.shopping.noteLabel}</span><textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </GuidedDisclosure>
      </div>
      <div className="guided-create-footer">
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? t.shopping.saving : t.shopping.save}</button>
      </div>
    </form>
  }

  return (
    <form className="shopping-item-form" onSubmit={handleSubmit}>
      <label>{t.shopping.nameLabel}<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="shopping-form-grid">
        <label>{t.shopping.quantityLabel}<input type="number" min="0.001" step="any" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label>{t.shopping.unitLabel}<select value={unit} onChange={(event) => setUnit(event.target.value as ShoppingUnit | '')}>
          <option value="">{t.shopping.unitNone}</option>
          {SHOPPING_UNITS.map((value) => <option key={value} value={value}>{shoppingUnitLabel(value)}</option>)}
        </select></label>
      </div>
      <label>{t.shopping.categoryLabel}<select value={category} onChange={(event) => setCategory(event.target.value as ShoppingCategory)}>
        {SHOPPING_CATEGORIES.map((value) => <option key={value} value={value}>{categorySettings?.[value].label ?? shoppingCategoryLabel(value)}</option>)}
      </select></label>
      <label>{t.shopping.noteLabel}<textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <label>{t.shopping.responsibleLabel}<select value={responsibleMemberId} onChange={(event) => setResponsibleMemberId(event.target.value)}>
        <option value="">{t.shopping.responsibleAnyone}</option>
        {members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}
      </select></label>
      {members.length === 0 && <p className="empty-state">{t.shopping.noResponsibleMembers}</p>}
      <div className="modal-footer">
        {onDelete && <DestructiveIconButton label={t.shopping.delete} onClick={() => { void onDelete() }} disabled={busy} />}
        <button type="submit" disabled={busy}>{busy ? t.shopping.saving : t.shopping.save}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
