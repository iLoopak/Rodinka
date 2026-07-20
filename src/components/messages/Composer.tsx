import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { t } from '../../strings'
import { useMessagesContent } from '../../context/messages/MessagesContentContext'
import {
  MESSAGE_ATTACHMENT_ALLOWED_TYPES,
  validateMessageAttachmentFile,
} from '../../utils/messageAttachment'
import type { MessageAttachmentRow } from '../../context/messages/types'
import type { ShareableEntityKind } from './ShareExistingEntityDialog'
import {
  applyMention,
  findMentionQuery,
  matchMentionCandidates,
  mentionedMemberIds,
  type MentionCandidate,
  type MentionQuery,
} from '../../utils/mentions'

export interface ComposerReplyContext {
  messageId: string
  authorName: string
  preview: string
}

interface Props {
  conversationId: string
  replyingTo: ComposerReplyContext | null
  onCancelReply: () => void
  onSend: (payload: {
    body: string
    replyToMessageId?: string | null
    attachmentIds?: string[]
    attachments?: MessageAttachmentRow[]
    mentionMemberIds?: string[]
  }) => Promise<void>
  /** Open the picker that shares an EXISTING planner record into the chat. */
  onShareEntity: (kind: ShareableEntityKind) => void
  /** Participants of this conversation, offered by the "@" autocomplete. */
  mentionCandidates: MentionCandidate[]
}

interface DraftAttachment {
  key: string
  file: File
  previewUrl: string
  state: 'uploading' | 'ready' | 'error'
  errorMessage?: string
  attachment?: MessageAttachmentRow
  abortController: AbortController
}

// Text + optional photo composer with a "+" menu.
//
// "Foto" uploads a new file. The other three entries SHARE something that
// already exists in the app — they open a picker, never a creation form, so
// using them can never duplicate a chore, shopping item or activity.
// Creating a record *from* a message is a separate action on the message
// context menu, where it can prefill from that message's text.
export function Composer({ conversationId, replyingTo, onCancelReply, onSend, onShareEntity, mentionCandidates }: Props) {
  const { uploadAttachment, discardPendingAttachment } = useMessagesContent()
  const [value, setValue] = useState('')
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [drafts, setDrafts] = useState<DraftAttachment[]>([])
  const [plusOpen, setPlusOpen] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  const readyAttachments = useMemo(
    () => drafts.filter((d) => d.state === 'ready' && d.attachment).map((d) => d.attachment as MessageAttachmentRow),
    [drafts],
  )
  const readyIds = useMemo(() => readyAttachments.map((a) => a.id), [readyAttachments])
  const uploading = drafts.some((d) => d.state === 'uploading')

  useEffect(() => {
    return () => {
      // Any leftover object URLs are revoked when the composer unmounts.
      for (const draft of draftsRef.current) URL.revokeObjectURL(draft.previewUrl)
    }
  }, [])

  const autosize = useCallback((textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [])

  const clearDraft = useCallback(async (key: string) => {
    const draft = draftsRef.current.find((d) => d.key === key)
    if (!draft) return
    draft.abortController.abort()
    URL.revokeObjectURL(draft.previewUrl)
    if (draft.attachment) {
      await discardPendingAttachment(draft.attachment.id, draft.attachment.storage_path)
    }
    setDrafts((current) => current.filter((d) => d.key !== key))
  }, [discardPendingAttachment])

  const onPickPhoto = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    for (const file of files) {
      const validation = validateMessageAttachmentFile(file)
      if (validation === 'too_large') { setUploadError(t.messages.photoTooLarge); continue }
      if (validation === 'unsupported') { setUploadError(t.messages.photoUnsupported); continue }
      if (validation) continue
      const key = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(file)
      const controller = new AbortController()
      const draft: DraftAttachment = {
        key,
        file,
        previewUrl,
        state: 'uploading',
        abortController: controller,
      }
      setDrafts((current) => [...current, draft])
      try {
        const { attachment } = await uploadAttachment(conversationId, file, controller.signal)
        setDrafts((current) =>
          current.map((d) => (d.key === key ? { ...d, state: 'ready', attachment } : d)),
        )
      } catch (e) {
        if (controller.signal.aborted) {
          setDrafts((current) => current.filter((d) => d.key !== key))
          URL.revokeObjectURL(previewUrl)
          return
        }
        console.error('Attachment upload failed:', e)
        setUploadError(t.errors.generic)
        setDrafts((current) =>
          current.map((d) => (d.key === key ? { ...d, state: 'error', errorMessage: (e as Error).message } : d)),
        )
      }
    }
  }, [conversationId, uploadAttachment])

  const openPhotoPicker = useCallback(() => {
    setPlusOpen(false)
    fileInputRef.current?.click()
  }, [])

  const mentionMatches = useMemo(
    () => (mentionQuery ? matchMentionCandidates(mentionCandidates, mentionQuery.query) : []),
    [mentionQuery, mentionCandidates],
  )

  // Re-derived from the text on every change rather than accumulated as the
  // user picks from the dropdown: if they delete or edit a name by hand, the
  // mention disappears with it and no stale ping is sent.
  const syncMentionQuery = useCallback((text: string, caret: number) => {
    const next = findMentionQuery(text, caret)
    setMentionQuery(next)
    setMentionIndex(0)
  }, [])

  const selectMention = useCallback((member: MentionCandidate) => {
    const textarea = textareaRef.current
    if (!textarea || !mentionQuery) return
    const caret = textarea.selectionStart ?? value.length
    const result = applyMention(value, mentionQuery, caret, member)
    setValue(result.text)
    setMentionQuery(null)
    setMentionIndex(0)
    // Restore the caret after React has written the new value back.
    requestAnimationFrame(() => {
      const element = textareaRef.current
      if (!element) return
      element.focus()
      element.setSelectionRange(result.caret, result.caret)
      autosize(element)
    })
  }, [value, mentionQuery, autosize])

  const submit = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed && readyIds.length === 0) return
    if (sending || uploading) return
    setSending(true)
    try {
      await onSend({
        body: trimmed,
        replyToMessageId: replyingTo?.messageId ?? null,
        attachmentIds: readyIds,
        attachments: readyAttachments,
        mentionMemberIds: mentionedMemberIds(trimmed, mentionCandidates),
      })
      setValue('')
      setMentionQuery(null)
      setDrafts((current) => {
        for (const d of current) URL.revokeObjectURL(d.previewUrl)
        return []
      })
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    } catch (e) {
      console.error('Failed to send message:', e)
    } finally {
      setSending(false)
    }
  }, [value, readyIds, readyAttachments, sending, uploading, onSend, replyingTo, mentionCandidates])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    // While the autocomplete is open it owns the arrows, Enter/Tab and
    // Escape; Enter must not send a half-typed "@pe".
    if (mentionQuery && mentionMatches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionIndex((index) => (index + 1) % mentionMatches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionIndex((index) => (index - 1 + mentionMatches.length) % mentionMatches.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        selectMention(mentionMatches[Math.min(mentionIndex, mentionMatches.length - 1)])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionQuery(null)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      void submit()
    }
  }, [submit, mentionQuery, mentionMatches, mentionIndex, selectMention])

  return (
    <div className="messages-composer-shell">
      {replyingTo && (
        <div className="messages-composer-reply-strip" role="status">
          <span className="messages-composer-reply-author">{t.messages.replyPreviewFrom(replyingTo.authorName)}</span>
          <span className="messages-composer-reply-preview">{replyingTo.preview}</span>
          <button type="button" className="btn-icon-plain" aria-label={t.messages.cancelReply} onClick={onCancelReply}>
            <CrossIcon />
          </button>
        </div>
      )}
      {drafts.length > 0 && (
        <div className="messages-composer-attachment-tray">
          {drafts.map((draft) => (
            <div key={draft.key} className={`messages-composer-attachment${draft.state === 'error' ? ' is-error' : ''}`}>
              <img src={draft.previewUrl} alt="" className="messages-composer-attachment-image" />
              {draft.state === 'uploading' && (
                <div className="messages-composer-attachment-overlay" role="status" aria-label={t.messages.photoUploading}>
                  <span className="messages-composer-attachment-spinner" />
                </div>
              )}
              {draft.state === 'error' && (
                <div className="messages-composer-attachment-overlay" role="alert">
                  <span className="messages-composer-attachment-error">!</span>
                </div>
              )}
              <button
                type="button"
                className="messages-composer-attachment-remove"
                aria-label={draft.state === 'uploading' ? t.messages.cancelUpload : t.messages.removePhoto}
                onClick={() => void clearDraft(draft.key)}
              >
                <CrossIcon />
              </button>
            </div>
          ))}
        </div>
      )}
      {uploadError && (
        <p className="messages-composer-error" role="alert">{uploadError}</p>
      )}
      {mentionMatches.length > 0 && (
        <ul
          className="messages-mention-list"
          id={`messages-mention-list-${conversationId}`}
          role="listbox"
          aria-label={t.messages.mentionListLabel}
        >
          {mentionMatches.map((member, index) => (
            <li key={member.id} role="presentation">
              <button
                type="button"
                id={`messages-mention-option-${conversationId}-${index}`}
                role="option"
                aria-selected={index === Math.min(mentionIndex, mentionMatches.length - 1)}
                className={`messages-mention-option${index === Math.min(mentionIndex, mentionMatches.length - 1) ? ' is-active' : ''}`}
                // Pointer-down beats the textarea blur, so the click lands.
                onMouseDown={(event) => { event.preventDefault(); selectMention(member) }}
                onMouseEnter={() => setMentionIndex(index)}
              >
                <span className="messages-mention-option-at" aria-hidden="true">@</span>
                {member.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="messages-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="messages-composer-plus-wrapper">
          <button
            type="button"
            className="messages-composer-plus-button"
            aria-label={t.messages.composerPlusAria}
            aria-expanded={plusOpen}
            onClick={() => setPlusOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
          {plusOpen && (
            <div
              className="messages-composer-plus-menu"
              role="menu"
              onBlur={() => setPlusOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                className="messages-composer-plus-menu-item"
                onClick={openPhotoPicker}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="11" r="2" />
                  <path d="m4 18 6-5 5 4 4-3 1 1" strokeLinejoin="round" />
                </svg>
                {t.messages.composerPlusPhoto}
              </button>
              <button
                type="button"
                role="menuitem"
                className="messages-composer-plus-menu-item"
                onClick={() => { setPlusOpen(false); onShareEntity('task') }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t.messages.composerPlusTask}
              </button>
              <button
                type="button"
                role="menuitem"
                className="messages-composer-plus-menu-item"
                onClick={() => { setPlusOpen(false); onShareEntity('shopping_item') }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 6h15l-1.5 9h-12z" strokeLinejoin="round" />
                  <path d="M6 6 5 3H3" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" />
                </svg>
                {t.messages.composerPlusShopping}
              </button>
              <button
                type="button"
                role="menuitem"
                className="messages-composer-plus-menu-item"
                onClick={() => { setPlusOpen(false); onShareEntity('event') }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
                </svg>
                {t.messages.composerPlusEvent}
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={MESSAGE_ATTACHMENT_ALLOWED_TYPES.join(',')}
          className="visually-hidden"
          onChange={onPickPhoto}
          multiple={false}
        />
        <label className="visually-hidden" htmlFor={`messages-composer-input-${conversationId}`}>{t.messages.composerLabel}</label>
        <textarea
          id={`messages-composer-input-${conversationId}`}
          ref={textareaRef}
          value={value}
          rows={1}
          placeholder={t.messages.composerPlaceholder}
          role="combobox"
          aria-expanded={mentionMatches.length > 0}
          aria-controls={`messages-mention-list-${conversationId}`}
          aria-autocomplete="list"
          aria-activedescendant={
            mentionMatches.length > 0
              ? `messages-mention-option-${conversationId}-${Math.min(mentionIndex, mentionMatches.length - 1)}`
              : undefined
          }
          onChange={(event) => {
            setValue(event.target.value)
            syncMentionQuery(event.target.value, event.target.selectionStart ?? event.target.value.length)
            autosize(event.currentTarget)
          }}
          onKeyUp={(event) => {
            // Arrow/click caret moves can leave or enter a mention token
            // without changing the text.
            if (!mentionQuery && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            const target = event.currentTarget
            syncMentionQuery(target.value, target.selectionStart ?? target.value.length)
          }}
          onClick={(event) => {
            const target = event.currentTarget
            syncMentionQuery(target.value, target.selectionStart ?? target.value.length)
          }}
          onBlur={() => {
            // Delayed so a pointer click on an option is not cancelled by
            // the dropdown unmounting first.
            window.setTimeout(() => setMentionQuery(null), 120)
          }}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button
          type="submit"
          className="messages-send-button"
          disabled={sending || uploading || (value.trim().length === 0 && readyIds.length === 0)}
          aria-label={t.messages.sendAria}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 12h16m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  )
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  )
}
