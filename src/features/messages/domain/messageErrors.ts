import { type AppErrorCode } from '../../../errors/errorCodes'
import { createDomainErrorConverter, DomainError, extractErrorMessage } from '../../../errors/domainError'

export type MessagesOperation =
  | 'messages.listPage'
  | 'messages.hydrate'
  | 'messages.send'
  | 'messages.edit'
  | 'messages.delete'
  | 'messages.addReaction'
  | 'messages.removeReaction'
  | 'messages.uploadAttachment'
  | 'messages.registerAttachment'
  | 'messages.discardAttachment'
  | 'messages.resolveEntities'
  | 'messages.postEntitySystemMessage'
  | 'conversations.list'
  | 'conversations.ensureGroup'
  | 'conversations.ensureDirect'
  | 'conversations.shareEntity'
  | 'conversations.setMute'
  | 'conversations.markRead'

export class MessagesError extends DomainError<MessagesOperation> {
  constructor(operation: MessagesOperation, code: AppErrorCode, cause?: unknown) {
    super('MessagesError', 'messages', operation, code, cause)
  }
}

function refine(operation: MessagesOperation, code: AppErrorCode, error: unknown): AppErrorCode {
  const text = extractErrorMessage(error)

  // Acting on a message somebody deleted while the thread was open. Retrying
  // will fail identically; the user needs the thread reloaded, so this is a
  // conflict rather than a missing row.
  const actsOnExistingMessage = operation === 'messages.edit'
    || operation === 'messages.delete'
    || operation === 'messages.addReaction'
    || operation === 'messages.removeReaction'
  if (actsOnExistingMessage && (code === 'not-found' || /deleted|no longer exists/i.test(text))) return 'conflict'

  // Discarding an attachment that is already gone, or already bound to a sent
  // message, is not an error worth surfacing twice.
  if (operation === 'messages.discardAttachment' && (code === 'not-found' || /already/i.test(text))) return 'conflict'

  // Not a member of the conversation. RLS returns no rows rather than an
  // error for reads, so this mostly shows up on writes.
  if (/not a (member|participant)|not permitted/i.test(text)) return 'permission-denied'

  if (operation === 'messages.uploadAttachment' && /exceeded|too large|quota/i.test(text)) return 'storage-quota'

  return code
}

export const toMessagesError = createDomainErrorConverter(MessagesError, refine)
