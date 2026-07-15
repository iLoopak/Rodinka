import { supabase } from '../supabaseClient'
import type { ShoppingItem } from '../utils/shopping'
import type { ShoppingMutation } from './shoppingMutationQueue'

const SHOPPING_SELECT = 'id, family_id, name, normalized_name, quantity, unit, note, category, created_by_member_id, responsible_member_id, purchased, purchased_by_member_id, purchased_at, archived_at, source_meal_id, source_meal_plan_entry_id, sort_order, created_at, updated_at'

export interface ShoppingRemote {
  fetchItems(familyId: string): Promise<ShoppingItem[]>
  applyMutation(mutation: ShoppingMutation): Promise<void>
}

export interface ShoppingSyncResult {
  items: ShoppingItem[]
  lastSuccessfulSyncAt: string
}

export class SupabaseShoppingRemote implements ShoppingRemote {
  async fetchItems(familyId: string) {
    const { data, error } = await supabase
      .from('shopping_items')
      .select(SHOPPING_SELECT)
      .eq('family_id', familyId)
      .order('updated_at', { ascending: false })
      .limit(1000)
    if (error) throw error
    return (data ?? []) as ShoppingItem[]
  }

  async applyMutation(mutation: ShoppingMutation) {
    const { error } = await supabase.rpc('apply_shopping_mutation', {
      p_mutation_id: mutation.mutationId,
      p_family_id: mutation.familyId,
      p_mutation_type: mutation.type,
      p_item_id: mutation.itemId,
      p_payload: mutation.payload,
    })
    if (error) throw error
  }
}

export async function synchronizeShopping(
  familyId: string,
  mutations: ShoppingMutation[],
  remote: ShoppingRemote,
): Promise<ShoppingSyncResult> {
  for (const mutation of mutations) await remote.applyMutation(mutation)

  const items = await remote.fetchItems(familyId)
  const lastSuccessfulSyncAt = new Date().toISOString()
  return { items, lastSuccessfulSyncAt }
}
