import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { t } from '../strings'
import {
  buildCommonShoppingTemplates,
  buildShoppingSessions,
  type MealIngredient,
  type MealIngredientInput,
  type ShoppingAddResult,
  type ShoppingBatchResult,
  type ShoppingItem,
  type ShoppingItemInput,
} from '../utils/shopping'

function friendly(error: { message: string }) {
  console.error(error.message)
  return new Error(t.errors.generic)
}

function itemInputRow(input: ShoppingItemInput) {
  return {
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit,
    note: input.note.trim() || null,
    category: input.category,
    responsible_member_id: input.responsibleMemberId,
    updated_at: new Date().toISOString(),
  }
}

export function useShoppingData(familyId: string | undefined) {
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([])
  const [mealIngredients, setMealIngredients] = useState<MealIngredient[]>([])
  const [shoppingLoading, setShoppingLoading] = useState(true)
  const [shoppingError, setShoppingError] = useState<string | null>(null)

  const refreshShopping = useCallback(async () => {
    if (!familyId) {
      setShoppingItems([])
      setMealIngredients([])
      setShoppingLoading(false)
      return
    }

    setShoppingLoading(true)
    const [visibleItemsResult, historyResult, ingredientsResult] = await Promise.all([
      supabase
        .from('shopping_items')
        .select('id, family_id, name, normalized_name, quantity, unit, note, category, created_by_member_id, responsible_member_id, purchased, purchased_by_member_id, purchased_at, archived_at, source_meal_id, source_meal_plan_entry_id, created_at, updated_at')
        .eq('family_id', familyId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('shopping_items')
        .select('id, family_id, name, normalized_name, quantity, unit, note, category, created_by_member_id, responsible_member_id, purchased, purchased_by_member_id, purchased_at, archived_at, source_meal_id, source_meal_plan_entry_id, created_at, updated_at')
        .eq('family_id', familyId)
        .eq('purchased', true)
        .order('purchased_at', { ascending: false })
        .limit(150),
      supabase
        .from('meal_ingredients')
        .select('id, meal_id, name, quantity, unit, note, category, sort_order, created_at, updated_at')
        .order('sort_order')
        .limit(500),
    ])

    if (visibleItemsResult.error || historyResult.error || ingredientsResult.error) {
      console.error('Failed to load shopping data:', visibleItemsResult.error?.message ?? historyResult.error?.message ?? ingredientsResult.error?.message)
      setShoppingError(t.errors.loadFailed)
    } else {
      const byId = new Map<string, ShoppingItem>()
      for (const item of [...(visibleItemsResult.data ?? []), ...(historyResult.data ?? [])] as ShoppingItem[]) byId.set(item.id, item)
      setShoppingItems([...byId.values()])
      setMealIngredients((ingredientsResult.data ?? []) as MealIngredient[])
      setShoppingError(null)
    }
    setShoppingLoading(false)
  }, [familyId])

  useEffect(() => { refreshShopping() }, [refreshShopping])

  const addShoppingItem = useCallback(async (input: ShoppingItemInput, forceSeparate = false): Promise<ShoppingAddResult> => {
    const { data, error } = await supabase.rpc('add_shopping_item', {
      p_family_id: familyId,
      p_name: input.name,
      p_quantity: input.quantity,
      p_unit: input.unit,
      p_note: input.note,
      p_category: input.category,
      p_responsible_member_id: input.responsibleMemberId,
      p_source_meal_id: null,
      p_source_meal_plan_entry_id: null,
      p_force_separate: forceSeparate,
    })
    if (error) throw friendly(error)
    await refreshShopping()
    return data as ShoppingAddResult
  }, [familyId, refreshShopping])

  const updateShoppingItem = useCallback(async (id: string, input: ShoppingItemInput) => {
    const { error } = await supabase.from('shopping_items').update(itemInputRow(input)).eq('id', id)
    if (error) throw friendly(error)
    await refreshShopping()
  }, [refreshShopping])

  const deleteShoppingItem = useCallback(async (id: string) => {
    const previous = shoppingItems
    setShoppingItems((items) => items.filter((item) => item.id !== id))
    const { error } = await supabase.from('shopping_items').delete().eq('id', id)
    if (error) {
      setShoppingItems(previous)
      throw friendly(error)
    }
  }, [shoppingItems])

  const toggleShoppingPurchased = useCallback(async (id: string, purchased: boolean) => {
    const previous = shoppingItems
    const timestamp = purchased ? new Date().toISOString() : null
    setShoppingItems((items) => items.map((item) => item.id === id
      ? { ...item, purchased, purchased_at: timestamp, purchased_by_member_id: null }
      : item))
    const { error } = await supabase.rpc('set_shopping_item_purchased', { p_item_id: id, p_purchased: purchased })
    if (error) {
      setShoppingItems(previous)
      throw friendly(error)
    }
    await refreshShopping()
  }, [shoppingItems, refreshShopping])

  const archivePurchasedShoppingItems = useCallback(async () => {
    const { error } = await supabase.rpc('archive_purchased_shopping_items', { p_family_id: familyId })
    if (error) throw friendly(error)
    await refreshShopping()
  }, [familyId, refreshShopping])

  const importShoppingItems = useCallback(async (
    items: ShoppingItemInput[],
    source?: { mealId?: string | null; planEntryId?: string | null }
  ): Promise<ShoppingBatchResult> => {
    const { data, error } = await supabase.rpc('import_shopping_items', {
      p_family_id: familyId,
      p_items: items,
      p_source_meal_id: source?.mealId ?? null,
      p_source_meal_plan_entry_id: source?.planEntryId ?? null,
    })
    if (error) throw friendly(error)
    await refreshShopping()
    return data as ShoppingBatchResult
  }, [familyId, refreshShopping])

  const replaceMealIngredients = useCallback(async (mealId: string, ingredients: MealIngredientInput[]) => {
    const { error } = await supabase.rpc('replace_meal_ingredients', {
      p_meal_id: mealId,
      p_ingredients: ingredients,
    })
    if (error) throw friendly(error)
    await refreshShopping()
  }, [refreshShopping])

  const activeShoppingItems = useMemo(
    () => shoppingItems.filter((item) => !item.purchased && item.archived_at === null),
    [shoppingItems]
  )
  const purchasedShoppingItems = useMemo(
    () => shoppingItems.filter((item) => item.purchased && item.archived_at === null),
    [shoppingItems]
  )
  const commonShoppingItems = useMemo(
    () => buildCommonShoppingTemplates(shoppingItems, activeShoppingItems),
    [shoppingItems, activeShoppingItems]
  )
  const shoppingSessions = useMemo(() => buildShoppingSessions(shoppingItems), [shoppingItems])
  const ingredientsForMeal = useMemo(() => {
    const byMeal = new Map<string, MealIngredient[]>()
    for (const ingredient of mealIngredients) {
      const list = byMeal.get(ingredient.meal_id)
      if (list) list.push(ingredient)
      else byMeal.set(ingredient.meal_id, [ingredient])
    }
    return (mealId: string) => byMeal.get(mealId) ?? []
  }, [mealIngredients])

  return {
    shoppingItems,
    activeShoppingItems,
    purchasedShoppingItems,
    commonShoppingItems,
    shoppingSessions,
    mealIngredients,
    ingredientsForMeal,
    shoppingLoading,
    shoppingError,
    refreshShopping,
    addShoppingItem,
    updateShoppingItem,
    deleteShoppingItem,
    toggleShoppingPurchased,
    archivePurchasedShoppingItems,
    importShoppingItems,
    replaceMealIngredients,
  }
}
