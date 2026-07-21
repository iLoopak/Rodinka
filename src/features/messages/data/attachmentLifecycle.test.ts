import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageAttachmentStorage } from './messageAttachmentStorage'

/**
 * The upload → register window is the riskiest part of this domain: the
 * object store and the database are separate systems, so between the two
 * steps an object exists that nothing references. Every path that ends there
 * has to clean up, and these tests pin each one.
 */

const rpcMock = vi.hoisted(() => vi.fn())
vi.mock('../../../supabaseClient', () => ({ supabase: { rpc: rpcMock, from: vi.fn(), storage: { from: vi.fn() } } }))
vi.mock('../../../utils/messageAttachment', () => ({
  validateMessageAttachmentFile: () => null,
  compressMessageAttachment: async (file: File) => ({ file, width: 10, height: 10 }),
  messageAttachmentExtension: () => 'jpg',
  buildMessageAttachmentPath: () => 'family-1/conversation-1/abc.jpg',
}))

const { SupabaseMessagesRepository } = await import('./supabaseMessagesRepository')

function fakeStorage() {
  const removed: string[] = []
  const uploaded: string[] = []
  const storage: MessageAttachmentStorage = {
    async upload(path) { uploaded.push(path) },
    async remove(path) { removed.push(path) },
    async sign() { return 'https://signed' },
  }
  return { storage, removed, uploaded }
}

// The rpc mock is module-level, so call history has to be cleared or one
// test's registration shows up in another's assertions.
beforeEach(() => rpcMock.mockClear())

const file = { type: 'image/jpeg', size: 1234, name: 'photo.jpg' } as unknown as File
const input = (signal?: AbortSignal) => ({
  conversationId: 'conversation-1', familyId: 'family-1', file, signal,
})

describe('attachment lifecycle', () => {
  it('uploads, registers and signs on the happy path', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'a1', message_id: 'm1', storage_path: 'family-1/conversation-1/abc.jpg' }, error: null })
    const { storage, uploaded, removed } = fakeStorage()

    const result = await new SupabaseMessagesRepository(storage).uploadAttachment(input())

    expect(uploaded).toEqual(['family-1/conversation-1/abc.jpg'])
    expect(result.attachment.id).toBe('a1')
    expect(result.signedUrl).toBe('https://signed')
    expect(removed).toEqual([])
  })

  it('removes the object when registration fails', async () => {
    // Otherwise the upload survives with nothing referencing it, forever.
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    const { storage, removed } = fakeStorage()

    await expect(new SupabaseMessagesRepository(storage).uploadAttachment(input())).rejects.toThrow()

    expect(removed).toEqual(['family-1/conversation-1/abc.jpg'])
  })

  it('removes the object when the caller aborts after the upload landed', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'a1' }, error: null })
    const controller = new AbortController()
    const { storage, removed } = fakeStorage()
    // Abort lands between upload and register.
    storage.upload = async () => { controller.abort() }

    await expect(new SupabaseMessagesRepository(storage).uploadAttachment(input(controller.signal)))
      .rejects.toThrow(/cancelled/i)

    expect(removed).toEqual(['family-1/conversation-1/abc.jpg'])
    // And it never registered metadata for an object it just deleted.
    expect(rpcMock).not.toHaveBeenCalledWith('register_message_attachment', expect.anything())
  })

  it('does not upload at all when aborted before the object is written', async () => {
    const controller = new AbortController()
    controller.abort()
    const { storage, uploaded, removed } = fakeStorage()

    await expect(new SupabaseMessagesRepository(storage).uploadAttachment(input(controller.signal)))
      .rejects.toThrow(/cancelled/i)

    expect(uploaded).toEqual([])
    expect(removed).toEqual([])
  })

  it('removes the object even when discarding the metadata fails', async () => {
    // The row may already be gone. The object still has to go, or a discard
    // that half-failed leaves the storage bill growing.
    rpcMock.mockResolvedValue({ data: null, error: { message: 'no rows' } })
    const { storage, removed } = fakeStorage()

    await new SupabaseMessagesRepository(storage).discardPendingAttachment('a1', 'family-1/conversation-1/abc.jpg')

    expect(removed).toEqual(['family-1/conversation-1/abc.jpg'])
  })

  it('still returns the attachment when signing fails', async () => {
    // An unsigned attachment renders as a placeholder; the message is still
    // readable, so a signing failure must not fail the upload.
    rpcMock.mockResolvedValue({ data: { id: 'a1' }, error: null })
    const { storage } = fakeStorage()
    storage.sign = async () => null

    const result = await new SupabaseMessagesRepository(storage).uploadAttachment(input())

    expect(result.attachment.id).toBe('a1')
    expect(result.signedUrl).toBe('')
  })
})
