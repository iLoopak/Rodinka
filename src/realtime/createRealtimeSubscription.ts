import { supabase } from '../supabaseClient'
import { connectionStateFromSubscribeStatus, type RealtimeConnectionState } from './connectionState'

export interface RealtimeTableConfig {
  table: string
  /**
   * e.g. `family_id=eq.<id>` — server-side filtering, only matching rows are
   * ever sent to the client. Omit only for tables with no direct family_id
   * column (e.g. chore_completions, scoped via a join) — RLS still limits
   * delivery to rows the current user's family can select, just without the
   * extra filter-string narrowing. Document the reason at the call site.
   */
  filter?: string
  onInsert?: (row: Record<string, unknown>) => void
  onUpdate?: (row: Record<string, unknown>) => void
  onDelete?: (row: Record<string, unknown>) => void
}

export interface CreateRealtimeSubscriptionOptions {
  /** `family:<familyId>:<domain>` — see README's Realtime section for the convention. */
  channelName: string
  tables: RealtimeTableConfig[]
  onStatusChange?: (state: RealtimeConnectionState) => void
}

const isDev = import.meta.env.DEV

function log(...args: unknown[]) {
  if (isDev) console.debug('[realtime]', ...args)
}

// One channel per feature-provider domain (not per table, not one global
// manager): a provider that owns several tables registers several
// postgres_changes listeners on the same channel before calling
// subscribe() once. Reconnection is handled by the underlying
// @supabase/realtime-js client automatically — this wrapper only maps its
// status callback to our RealtimeConnectionState vocabulary and never
// touches caller state on disconnect, so local data is never lost while
// reconnecting.
export function createRealtimeSubscription({ channelName, tables, onStatusChange }: CreateRealtimeSubscriptionOptions): () => void {
  let channel = supabase.channel(channelName)

  for (const config of tables) {
    if (config.onInsert) {
      const onInsert = config.onInsert
      channel = channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: config.table, filter: config.filter },
        (payload) => {
          log(channelName, 'INSERT', config.table)
          onInsert(payload.new as Record<string, unknown>)
        },
      )
    }
    if (config.onUpdate) {
      const onUpdate = config.onUpdate
      channel = channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: config.table, filter: config.filter },
        (payload) => {
          log(channelName, 'UPDATE', config.table)
          onUpdate(payload.new as Record<string, unknown>)
        },
      )
    }
    if (config.onDelete) {
      const onDelete = config.onDelete
      channel = channel.on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: config.table, filter: config.filter },
        (payload) => {
          log(channelName, 'DELETE', config.table)
          onDelete(payload.old as Record<string, unknown>)
        },
      )
    }
  }

  log(channelName, 'subscribing', tables.map((t) => t.table))
  channel.subscribe((status, error) => {
    log(channelName, 'status', status, error?.message)
    onStatusChange?.(connectionStateFromSubscribeStatus(status))
  })

  return () => {
    log(channelName, 'unsubscribing')
    void supabase.removeChannel(channel)
  }
}
