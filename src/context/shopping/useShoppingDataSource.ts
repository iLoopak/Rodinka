import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { ShoppingRepository, type ShoppingRepositorySnapshot } from '../../shopping/shoppingRepository'
import { getShoppingLocalStore } from '../../shopping/shoppingIndexedDb'
import {
  buildCommonShoppingTemplates,
  buildShoppingSessions,
  type MealIngredient,
  type MealIngredientInput,
  type ShoppingItemInput,
} from '../../utils/shopping'

const emptySnapshot: ShoppingRepositorySnapshot = {
  ready: false,
  hasUsableData: false,
  items: [],
  pendingItemIds: new Set(),
  pendingCount: 0,
  status: 'synced',
  lastSuccessfulSyncAt: null,
  error: null,
}

// "Source" (not "Data") to avoid ambiguity with the ShoppingContext
// accessor hook, useShopping().
export function useShoppingDataSource(familyId: string | undefined, currentMemberId: string | undefined) {
  const repositoryRef = useRef<ShoppingRepository | null>(null)
  const [snapshot, setSnapshot] = useState<ShoppingRepositorySnapshot>(emptySnapshot)
  const [mealIngredients, setMealIngredients] = useState<MealIngredient[]>([])

  const refreshMealIngredients = useCallback(async () => {
    if (!familyId || typeof navigator !== 'undefined' && !navigator.onLine) return
    const { data, error } = await supabase
      .from('meal_ingredients')
      .select('id, meal_id, name, quantity, unit, note, category, sort_order, created_at, updated_at')
      .order('sort_order')
      .limit(500)
    if (error) console.error('Failed to refresh meal ingredients:', error.message)
    else setMealIngredients((data ?? []) as MealIngredient[])
  }, [familyId])

  useEffect(() => {
    if (!familyId || !currentMemberId) {
      void repositoryRef.current?.stop()
      repositoryRef.current = null
      setSnapshot({ ...emptySnapshot, ready: true, status: 'synced' })
      setMealIngredients([])
      return
    }

    let active = true
    const repository = new ShoppingRepository({
      familyId,
      currentMemberId,
      store: getShoppingLocalStore(),
    })
    repositoryRef.current = repository
    const unsubscribe = repository.subscribe((next) => { if (active) setSnapshot(next) })
    repository.start().catch((error) => {
      console.error('Failed to initialize offline shopping:', error)
      if (active) setSnapshot((current) => ({ ...current, ready: true, status: 'error', error: 'initialization-failed' }))
    })
    void refreshMealIngredients()

    return () => {
      active = false
      unsubscribe()
      void repository.stop()
      if (repositoryRef.current === repository) repositoryRef.current = null
    }
  }, [currentMemberId, familyId, refreshMealIngredients])

  const refreshShopping = useCallback(async () => {
    await Promise.all([repositoryRef.current?.sync(), refreshMealIngredients()])
  }, [refreshMealIngredients])

  const addShoppingItem = useCallback((input: ShoppingItemInput, forceSeparate = false) => {
    if (!repositoryRef.current) throw new Error('Shopping repository is not ready')
    return repositoryRef.current.addItem(input, forceSeparate)
  }, [])

  const updateShoppingItem = useCallback((id: string, input: ShoppingItemInput) => {
    if (!repositoryRef.current) throw new Error('Shopping repository is not ready')
    return repositoryRef.current.updateItem(id, input)
  }, [])

  const deleteShoppingItem = useCallback((id: string) => {
    if (!repositoryRef.current) throw new Error('Shopping repository is not ready')
    return repositoryRef.current.deleteItem(id)
  }, [])

  const toggleShoppingPurchased = useCallback((id: string, purchased: boolean) => {
    if (!repositoryRef.current) throw new Error('Shopping repository is not ready')
    return repositoryRef.current.togglePurchased(id, purchased)
  }, [])

  const archivePurchasedShoppingItems = useCallback(() => {
    if (!repositoryRef.current) throw new Error('Shopping repository is not ready')
    return repositoryRef.current.archivePurchased()
  }, [])

  const importShoppingItems = useCallback((items: ShoppingItemInput[], source?: { mealId?: string | null; planEntryId?: string | null }) => {
    if (!repositoryRef.current) throw new Error('Shopping repository is not ready')
    return repositoryRef.current.importItems(items, source)
  }, [])

  const replaceMealIngredients = useCallback(async (mealId: string, ingredients: MealIngredientInput[]) => {
    const { error } = await supabase.rpc('replace_meal_ingredients', { p_meal_id: mealId, p_ingredients: ingredients })
    if (error) throw new Error(error.message)
    await refreshMealIngredients()
  }, [refreshMealIngredients])

  const reorderShoppingItems = useCallback((movedItemId: string, targetCategory: Parameters<ShoppingRepository['reorderItem']>[1], orderedTargetIds: string[]) => {
    if (!repositoryRef.current) throw new Error('Shopping repository is not ready')
    return repositoryRef.current.reorderItem(movedItemId, targetCategory, orderedTargetIds)
  }, [])

  const activeShoppingItems = useMemo(
    () => snapshot.items.filter((item) => !item.purchased && item.archived_at === null)
      .sort((a, b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at)),
    [snapshot.items],
  )
  const purchasedShoppingItems = useMemo(
    () => snapshot.items.filter((item) => item.purchased && item.archived_at === null),
    [snapshot.items],
  )
  const commonShoppingItems = useMemo(
    () => buildCommonShoppingTemplates(snapshot.items, activeShoppingItems),
    [activeShoppingItems, snapshot.items],
  )
  const shoppingSessions = useMemo(() => buildShoppingSessions(snapshot.items), [snapshot.items])
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
    shoppingItems: snapshot.items,
    activeShoppingItems,
    purchasedShoppingItems,
    commonShoppingItems,
    shoppingSessions,
    mealIngredients,
    ingredientsForMeal,
    shoppingLoading: !snapshot.ready,
    shoppingHasUsableData: snapshot.hasUsableData,
    shoppingError: snapshot.ready && snapshot.status === 'error' && !snapshot.hasUsableData ? 'shopping-unavailable' : null,
    shoppingSyncStatus: snapshot.status,
    shoppingSyncError: snapshot.error,
    pendingShoppingChanges: snapshot.pendingCount,
    pendingShoppingItemIds: snapshot.pendingItemIds,
    shoppingLastSyncedAt: snapshot.lastSuccessfulSyncAt,
    refreshShopping,
    addShoppingItem,
    updateShoppingItem,
    deleteShoppingItem,
    toggleShoppingPurchased,
    archivePurchasedShoppingItems,
    importShoppingItems,
    replaceMealIngredients,
    reorderShoppingItems,
  }
}
