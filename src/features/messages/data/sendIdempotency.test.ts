import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `client_id` is the idempotency key for sending. The server deduplicates on
 * it, and `retryFailedMessage` deliberately reuses the key of the attempt it
 * is retrying. If the client ever mints a fresh one on retry, the same message
 * is posted twice — with no error, and no way for the server to tell.
 *
 * The same key protects `share_entity_to_conversation`, so a double-tapped
 * share cannot post two identical cards.
 */

const rpcMock = vi.hoisted(() => vi.fn())
vi.mock('../../../supabaseClient', () => ({ supabase: { rpc: rpcMock, from: vi.fn(), storage: { from: vi.fn() } } }))

const { SupabaseMessagesRepository } = await import('./supabaseMessagesRepository')
const { SupabaseConversationsRepository } = await import('./conversationsRepository')

beforeEach(() => {
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ data: { id: 'm1', conversation_id: 'c1' }, error: null })
})

const send = (clientId: string) => ({ conversationId: 'c1', body: 'ahoj', clientId })

function lastArgs() {
  return rpcMock.mock.calls.at(-1)?.[1] as Record<string, unknown>
}

type ShareArg = Parameters<InstanceType<typeof SupabaseConversationsRepository>['shareEntity']>[1]

describe('send idempotency', () => {
  it('passes the caller-supplied client id straight through', async () => {
    await new SupabaseMessagesRepository().send(send('client-abc'))
    expect(lastArgs().p_client_id).toBe('client-abc')
  })

  it('sends the same key on a retry of the same message', async () => {
    const repository = new SupabaseMessagesRepository()
    await repository.send(send('client-abc'))
    // A retry reuses the key of the attempt it is retrying.
    await repository.send(send('client-abc'))

    const keys = rpcMock.mock.calls.map((call) => (call[1] as Record<string, unknown>).p_client_id)
    expect(keys).toEqual(['client-abc', 'client-abc'])
  })

  it('never invents a key of its own', async () => {
    // If the repository generated one, two sends of the same message would
    // carry different keys and the server would insert both.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(join(process.cwd(), 'src/features/messages/data/supabaseMessagesRepository.ts'), 'utf8')
    const sendBody = source.slice(source.indexOf('async send('), source.indexOf('async edit('))
    expect(sendBody).not.toContain('randomUUID')
  })

  it('omits empty attachment and mention lists rather than sending empty arrays', async () => {
    await new SupabaseMessagesRepository().send({ ...send('client-abc'), attachmentIds: [], mentionMemberIds: [] })
    expect(lastArgs().p_attachment_ids).toBeNull()
    expect(lastArgs().p_mention_member_ids).toBeNull()
  })

  it('returns the inserted row so the caller can replace its optimistic one', async () => {
    const inserted = await new SupabaseMessagesRepository().send(send('client-abc'))
    expect(inserted?.id).toBe('m1')
  })

  it('carries a client id on entity shares too', async () => {
    await new SupabaseConversationsRepository().shareEntity('c1', {
      entityType: 'task', entityId: 'e1', body: 'koukni', clientId: 'share-abc',
    } as ShareArg)

    expect(lastArgs().p_client_id).toBe('share-abc')
  })

  it('generates a share key only when the caller gave none', async () => {
    // Unlike send, share has no retry path that must reuse a key, so a
    // generated fallback is acceptable there.
    await new SupabaseConversationsRepository().shareEntity('c1', {
      entityType: 'task', entityId: 'e1',
    } as ShareArg)

    expect(lastArgs().p_client_id).toBeTruthy()
  })
})
