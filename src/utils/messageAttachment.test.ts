import { describe, expect, it } from 'vitest'
import {
  MESSAGE_ATTACHMENT_ALLOWED_TYPES,
  MESSAGE_ATTACHMENT_MAX_INPUT_BYTES,
  buildMessageAttachmentPath,
  messageAttachmentExtension,
  validateMessageAttachmentFile,
} from './messageAttachment'

describe('message attachment validation', () => {
  it.each([...MESSAGE_ATTACHMENT_ALLOWED_TYPES])('accepts %s', (type) => {
    expect(validateMessageAttachmentFile({ type, size: 1024 })).toBeNull()
  })

  it('rejects unsupported types, empty files, and oversized inputs', () => {
    expect(validateMessageAttachmentFile({ type: 'image/svg+xml', size: 1024 })).toBe('unsupported')
    expect(validateMessageAttachmentFile({ type: 'application/pdf', size: 1024 })).toBe('unsupported')
    expect(validateMessageAttachmentFile({ type: 'image/jpeg', size: 0 })).toBe('empty')
    expect(validateMessageAttachmentFile({ type: 'image/jpeg', size: MESSAGE_ATTACHMENT_MAX_INPUT_BYTES + 1 })).toBe('too_large')
  })

  it('builds a family/conversation/unique-file storage path that the DB + storage policy will accept', () => {
    const path = buildMessageAttachmentPath(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'webp',
      '33333333-3333-4333-8333-333333333333',
    )
    expect(path).toBe(
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp',
    )
    // The three segments MUST be present so
    // can_write_message_attachment's split_part checks succeed.
    expect(path.split('/')).toHaveLength(3)
  })

  it('normalises mime types to safe file extensions', () => {
    expect(messageAttachmentExtension('image/png')).toBe('png')
    expect(messageAttachmentExtension('image/webp')).toBe('webp')
    expect(messageAttachmentExtension('image/gif')).toBe('gif')
    expect(messageAttachmentExtension('image/jpeg')).toBe('jpg')
    // Anything else — including a spoofed content type — falls back
    // to 'jpg' so the extension never carries an unexpected suffix
    // that would fail the storage policy regex.
    expect(messageAttachmentExtension('image/tiff')).toBe('jpg')
    expect(messageAttachmentExtension('')).toBe('jpg')
  })
})
