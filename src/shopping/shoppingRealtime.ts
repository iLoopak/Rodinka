import { supabase } from '../supabaseClient'
import { connectionStateFromSubscribeStatus } from '../realtime/connectionState'
import { openRealtimeLifecycle } from '../realtime/realtimeRegistry'

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
  const lifecycle = openRealtimeLifecycle({
    channelName: topic,
    owner: 'ShoppingRepository',
    openReason: 'repository-start',
    tables: ['shopping_items'],
  })
  try {
    channel.subscribe((status) => lifecycle.status(connectionStateFromSubscribeStatus(status)))
  } catch (error) {
    lifecycle.close('subscribe-failed')
    throw error
  }

  let stopped = false
  return async () => {
    if (stopped) return
    stopped = true
    const teardown = Promise.resolve(supabase.removeChannel(channel)).then(() => undefined, () => undefined)
    channelTeardowns.set(topic, teardown)
    try { await teardown }
    finally {
      lifecycle.close('repository-stop')
      if (channelTeardowns.get(topic) === teardown) channelTeardowns.delete(topic)
    }
  }
}
