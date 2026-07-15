import { SHOPPING_CATEGORIES, type ShoppingCategory } from './shopping'

export interface ShoppingCategoryAppearance {
  label: string | null
  color: string
}

export type ShoppingCategorySettings = Record<ShoppingCategory, ShoppingCategoryAppearance>

const DEFAULT_COLORS: Record<ShoppingCategory, string> = {
  produce: '#4F8A63',
  bakery: '#C48745',
  meat: '#B8564F',
  dairy: '#5E83B5',
  household: '#8671B4',
  pharmacy: '#C05F88',
  other: '#6F7D83',
}

export function defaultShoppingCategorySettings(): ShoppingCategorySettings {
  return Object.fromEntries(SHOPPING_CATEGORIES.map((category) => [category, {
    label: null,
    color: DEFAULT_COLORS[category],
  }])) as ShoppingCategorySettings
}

export function normalizeShoppingCategorySettings(value: unknown): ShoppingCategorySettings {
  const defaults = defaultShoppingCategorySettings()
  if (!value || typeof value !== 'object') return defaults
  const source = value as Record<string, unknown>
  for (const category of SHOPPING_CATEGORIES) {
    const entry = source[category]
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Record<string, unknown>
    const color = typeof candidate.color === 'string' && /^#[0-9a-f]{6}$/i.test(candidate.color)
      ? candidate.color.toUpperCase()
      : defaults[category].color
    const label = typeof candidate.label === 'string' ? candidate.label.trim().slice(0, 40) : ''
    defaults[category] = { color, label: label || null }
  }
  return defaults
}
