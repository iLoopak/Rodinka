import { useEffect, useState } from 'react'
import { useFamilyCore } from '../../context/family/FamilyCoreContext'
import { useShopping } from '../../context/shopping/ShoppingContext'
import { t } from '../../strings'
import { ingredientsForImport, SHOPPING_CATEGORIES, SHOPPING_UNITS, type MealIngredientInput, type ShoppingCategory, type ShoppingUnit } from '../../utils/shopping'
import { formatLocalizedShoppingQuantity, shoppingCategoryLabel, shoppingUnitLabel } from '../../utils/shoppingLabels'
import { EmptyState } from '../ui/EmptyState'
import { Modal } from '../ui/Modal'

interface Props {
  mealId: string
  sourcePlanEntryId?: string | null
  allowEdit?: boolean
}

const EMPTY_INGREDIENT: MealIngredientInput = { name: '', quantity: null, unit: null, note: '', category: 'other' }

export function MealIngredientsSection({ mealId, sourcePlanEntryId = null, allowEdit = true }: Props) {
  const { isParentOrAdmin } = useFamilyCore()
  const {
    ingredientsForMeal,
    mealIngredientsStatus,
    mealIngredientsError,
    ensureMealIngredients,
    retryMealIngredients,
    replaceMealIngredients,
    importShoppingItems,
  } = useShopping()
  const ingredients = ingredientsForMeal(mealId)
  const [editing, setEditing] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [rows, setRows] = useState<MealIngredientInput[]>([])
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    void ensureMealIngredients()
  }, [ensureMealIngredients])

  function startEditing() {
    setRows(ingredients.length > 0 ? ingredients.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, note: item.note ?? '', category: item.category })) : [{ ...EMPTY_INGREDIENT }])
    setEditing(true)
  }

  async function save() {
    const valid = rows.filter((row) => row.name.trim())
    setBusy(true)
    try { await replaceMealIngredients(mealId, valid); setEditing(false) }
    finally { setBusy(false) }
  }

  return <section className="meal-ingredients-section">
    <div className="meal-ingredients-header"><h4>{t.shopping.ingredientsTitle}</h4>{mealIngredientsStatus === 'ready' && allowEdit && isParentOrAdmin && !editing && <button type="button" className="link" onClick={startEditing}>{t.shopping.editIngredients}</button>}</div>
    {(mealIngredientsStatus === 'idle' || mealIngredientsStatus === 'loading') ? <p className="loading" role="status">{t.shopping.ingredientsLoading}</p>
      : mealIngredientsStatus === 'error' ? <div className="empty-state"><p role="alert">{mealIngredientsError === 'offline' ? t.offline.body : t.shopping.ingredientsLoadFailed}</p><button type="button" onClick={() => { void retryMealIngredients() }}>{t.errors.retry}</button></div>
        : editing ? <>
      <div className="ingredient-editor">{rows.map((row, index) => <IngredientRow key={index} value={row} onChange={(value) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))} onRemove={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))} />)}</div>
      <button type="button" className="btn-secondary ingredient-add-row" onClick={() => setRows((current) => [...current, { ...EMPTY_INGREDIENT }])}>+ {t.shopping.addIngredient}</button>
      <button type="button" onClick={save} disabled={busy}>{busy ? t.shopping.saving : t.shopping.saveIngredients}</button>
    </> : ingredients.length === 0 ? <EmptyState title={t.shopping.ingredientsEmpty} body={t.shopping.ingredientsEmptyHint} action={allowEdit && isParentOrAdmin ? { label: t.shopping.editIngredients, onClick: startEditing } : undefined} /> : <>
      <ul className="ingredient-list">{ingredients.map((ingredient) => <li key={ingredient.id}><span>{ingredient.name}</span><small>{formatLocalizedShoppingQuantity(ingredient.quantity, ingredient.unit)}{ingredient.note ? ` · ${ingredient.note}` : ''}</small></li>)}</ul>
      <button type="button" className="btn-secondary ingredients-import-action" onClick={() => setShowImport(true)}>{t.shopping.addIngredientsAction}</button>
    </>}
    {feedback && <p className="shopping-feedback" role="status">{feedback}</p>}
    {showImport && <IngredientImportModal ingredients={ingredients.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, note: item.note ?? '', category: item.category }))} onClose={() => setShowImport(false)} onImport={async (selected) => {
      const result = await importShoppingItems(ingredientsForImport(selected), { mealId, planEntryId: sourcePlanEntryId })
      setFeedback(t.shopping.copiedResult(result.added, result.merged, result.skipped, result.failed))
      setShowImport(false)
    }} />}
  </section>
}

function IngredientRow({ value, onChange, onRemove }: { value: MealIngredientInput; onChange: (value: MealIngredientInput) => void; onRemove: () => void }) {
  return <div className="ingredient-edit-row">
    <input aria-label={t.shopping.nameLabel} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder={t.shopping.nameLabel} />
    <div className="shopping-form-grid"><input aria-label={t.shopping.quantityLabel} type="number" min="0.001" step="any" value={value.quantity ?? ''} onChange={(event) => onChange({ ...value, quantity: event.target.value ? Number(event.target.value) : null })} /><select aria-label={t.shopping.unitLabel} value={value.unit ?? ''} onChange={(event) => onChange({ ...value, unit: (event.target.value || null) as ShoppingUnit | null })}><option value="">{t.shopping.unitNone}</option>{SHOPPING_UNITS.map((unit) => <option key={unit} value={unit}>{shoppingUnitLabel(unit)}</option>)}</select></div>
    <select aria-label={t.shopping.categoryLabel} value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value as ShoppingCategory })}>{SHOPPING_CATEGORIES.map((category) => <option key={category} value={category}>{shoppingCategoryLabel(category)}</option>)}</select>
    <input aria-label={t.shopping.noteLabel} value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} placeholder={t.shopping.noteLabel} />
    <button type="button" className="link" onClick={onRemove}>{t.shopping.delete}</button>
  </div>
}

function IngredientImportModal({ ingredients, onClose, onImport }: { ingredients: MealIngredientInput[]; onClose: () => void; onImport: (items: MealIngredientInput[]) => Promise<void> }) {
  const [rows, setRows] = useState(() => ingredients.map((ingredient, index) => ({ ...ingredient, key: index, selected: true })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = rows.filter((row) => row.selected)
  return <Modal title={t.shopping.importTitle} onClose={onClose}><div className="ingredient-import-list">{rows.map((row) => <div key={row.key} className="ingredient-import-row"><label className="checkbox-label"><input type="checkbox" checked={row.selected} onChange={() => setRows((current) => current.map((item) => item.key === row.key ? { ...item, selected: !item.selected } : item))} /><strong>{row.name}</strong></label><div className="shopping-form-grid"><input aria-label={`${t.shopping.quantityLabel} ${row.name}`} type="number" min="0.001" step="any" value={row.quantity ?? ''} onChange={(event) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, quantity: event.target.value ? Number(event.target.value) : null } : item))} /><span>{row.unit ? shoppingUnitLabel(row.unit) : t.shopping.unitNone}</span></div></div>)}</div><button type="button" disabled={busy || selected.length === 0} onClick={async () => { if (selected.length === 0) { setError(t.shopping.importNoneSelected); return } setBusy(true); try { await onImport(selected.map(({ key: _key, selected: _selected, ...item }) => item)) } catch (err) { console.error('Failed to import meal ingredients:', err); setError(t.errors.generic) } finally { setBusy(false) } }}>{busy ? t.shopping.saving : t.shopping.importSelected}</button>{error && <p className="error" role="alert">{error}</p>}</Modal>
}
