import { t } from '../strings'
import { formatShoppingQuantity } from './shopping'
import type { ShoppingCategory, ShoppingUnit } from './shopping'

export function shoppingCategoryLabel(category: ShoppingCategory) {
  return {
    produce: t.shopping.categoryProduce,
    bakery: t.shopping.categoryBakery,
    meat: t.shopping.categoryMeat,
    dairy: t.shopping.categoryDairy,
    household: t.shopping.categoryHousehold,
    pharmacy: t.shopping.categoryPharmacy,
    other: t.shopping.categoryOther,
  }[category]
}

export function shoppingUnitLabel(unit: ShoppingUnit) {
  return {
    pcs: t.shopping.unitPcs,
    pack: t.shopping.unitPack,
    kg: t.shopping.unitKg,
    g: t.shopping.unitG,
    l: t.shopping.unitL,
    ml: t.shopping.unitMl,
    bottle: t.shopping.unitBottle,
    can: t.shopping.unitCan,
    box: t.shopping.unitBox,
  }[unit]
}

export function formatLocalizedShoppingQuantity(quantity: number | null, unit: ShoppingUnit | null) {
  const formattedQuantity = formatShoppingQuantity(quantity, null)
  return [formattedQuantity, unit ? shoppingUnitLabel(unit) : ''].filter(Boolean).join(' ')
}
