export const SHOPPING_CATEGORIES = ['produce', 'bakery', 'meat', 'dairy', 'household', 'pharmacy', 'other'] as const
export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number]

export const SHOPPING_UNITS = ['pcs', 'pack', 'kg', 'g', 'l', 'ml', 'bottle', 'can', 'box'] as const
export type ShoppingUnit = (typeof SHOPPING_UNITS)[number]

export interface ShoppingItem {
  id: string
  family_id: string
  name: string
  normalized_name: string
  quantity: number | null
  unit: ShoppingUnit | null
  note: string | null
  category: ShoppingCategory
  created_by_member_id: string | null
  responsible_member_id: string | null
  purchased: boolean
  purchased_by_member_id: string | null
  purchased_at: string | null
  archived_at: string | null
  source_meal_id: string | null
  source_meal_plan_entry_id: string | null
  created_at: string
  updated_at: string
}

export interface ShoppingItemInput {
  name: string
  quantity: number | null
  unit: ShoppingUnit | null
  note: string
  category: ShoppingCategory
  responsibleMemberId: string | null
}

export interface MealIngredient {
  id: string
  meal_id: string
  name: string
  quantity: number | null
  unit: ShoppingUnit | null
  note: string | null
  category: ShoppingCategory
  sort_order: number
  created_at: string
  updated_at: string
}

export type MealIngredientInput = Omit<ShoppingItemInput, 'responsibleMemberId'>

export interface ShoppingBatchResult {
  added: number
  merged: number
  skipped: number
  failed: number
}

export interface ShoppingAddResult {
  action: 'added' | 'merged' | 'existing'
  item: ShoppingItem
}

export interface ShoppingTemplate {
  key: string
  name: string
  quantity: number | null
  unit: ShoppingUnit | null
  category: ShoppingCategory
  note: string
  uses: number
}

export interface ShoppingSession {
  key: string
  purchasedAt: string
  items: ShoppingItem[]
}

export function normalizeShoppingName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function validateShoppingInput(input: ShoppingItemInput): string | null {
  if (!normalizeShoppingName(input.name)) return 'name'
  if (input.quantity !== null && (!Number.isFinite(input.quantity) || input.quantity <= 0)) return 'quantity'
  return null
}

export function formatShoppingQuantity(quantity: number | null, unit: ShoppingUnit | null) {
  if (quantity === null) return unit ?? ''
  const formatted = Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(3)))
  return `${formatted}${unit ? ` ${unit}` : ''}`
}

export function findMergeCandidate(items: ShoppingItem[], input: ShoppingItemInput) {
  const normalized = normalizeShoppingName(input.name)
  return items.find((item) =>
    !item.purchased &&
    item.archived_at === null &&
    item.normalized_name === normalized &&
    item.unit === input.unit &&
    (item.note ?? '') === input.note.trim()
  ) ?? null
}

export function mergeCompatibleQuantity(existing: ShoppingItem, input: ShoppingItemInput): number | null {
  if (existing.unit !== input.unit) return null
  if (existing.quantity === null || input.quantity === null) return null
  return Number((existing.quantity + input.quantity).toFixed(3))
}

export function groupShoppingItems(items: ShoppingItem[]) {
  const groups = new Map<ShoppingCategory, ShoppingItem[]>()
  for (const category of SHOPPING_CATEGORIES) groups.set(category, [])
  for (const item of items) groups.get(item.category)?.push(item)
  return SHOPPING_CATEGORIES.map((category) => ({ category, items: groups.get(category) ?? [] }))
    .filter((group) => group.items.length > 0)
}

export function buildCommonShoppingTemplates(items: ShoppingItem[], activeItems: ShoppingItem[], limit = 8): ShoppingTemplate[] {
  const activeNames = new Set(activeItems.filter((item) => !item.purchased).map((item) => item.normalized_name))
  const templates = new Map<string, ShoppingTemplate>()

  for (const item of items) {
    if (!item.purchased || activeNames.has(item.normalized_name)) continue
    const key = `${item.normalized_name}|${item.unit ?? ''}|${item.category}`
    const existing = templates.get(key)
    if (existing) {
      existing.uses += 1
    } else {
      templates.set(key, {
        key,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        note: item.note ?? '',
        uses: 1,
      })
    }
  }

  return [...templates.values()].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)).slice(0, limit)
}

export function buildShoppingSessions(items: ShoppingItem[], limit = 12): ShoppingSession[] {
  const sessions = new Map<string, ShoppingItem[]>()
  for (const item of items) {
    if (!item.purchased_at) continue
    const key = item.purchased_at.slice(0, 10)
    const group = sessions.get(key)
    if (group) group.push(item)
    else sessions.set(key, [item])
  }
  return [...sessions.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, limit)
    .map(([key, sessionItems]) => ({ key, purchasedAt: key, items: sessionItems }))
}

export function shoppingItemsForCopy(items: ShoppingItem[]) {
  return items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    note: item.note ?? '',
    category: item.category,
    responsibleMemberId: null,
  }))
}

export function ingredientsForImport(ingredients: MealIngredientInput[]) {
  return ingredients.map((ingredient) => ({ ...ingredient, responsibleMemberId: null }))
}
