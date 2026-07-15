import { supabase } from '../supabaseClient'

export type ShoppingRealtimeSubscription = (familyId: string, onRemoteChange: () => void) => () => void

export const subscribeToShoppingRealtime: ShoppingRealtimeSubscription = (familyId, onRemoteChange) => {
  const channel = supabase
    .channel(`shopping-items:${familyId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'shopping_items',
      filter: `family_id=eq.${familyId}`,
    }, onRemoteChange)
    .subscribe()

  return () => { void supabase.removeChannel(channel) }
}
