import { supabase } from '../supabaseClient'

export type ShoppingRealtimeStop = () => Promise<void>
export type ShoppingRealtimeSubscription = (familyId: string, onRemoteChange: () => void) => Promise<ShoppingRealtimeStop>

const channelTeardowns = new Map<string, Promise<void>>()

export const subscribeToShoppingRealtime: ShoppingRealtimeSubscription = async (familyId, onRemoteChange) => {
  const topic = `family:${familyId}:shopping`
  await channelTeardowns.get(topic)
  const channel = supabase
    .channel(topic)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'shopping_items',
      filter: `family_id=eq.${familyId}`,
    }, onRemoteChange)
    .subscribe()

  let stopped = false
  return async () => {
    if (stopped) return
    stopped = true
    const teardown = supabase.removeChannel(channel).then(() => undefined)
    channelTeardowns.set(topic, teardown)
    try { await teardown }
    finally { if (channelTeardowns.get(topic) === teardown) channelTeardowns.delete(topic) }
  }
}
