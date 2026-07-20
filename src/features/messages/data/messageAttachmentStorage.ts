import { supabase } from '../../../supabaseClient'
import { toMessagesError } from '../domain/messageErrors'

const BUCKET = 'message-attachments'
export const ATTACHMENT_SIGNED_URL_SECONDS = 60 * 60

/**
 * The only place that touches the attachment bucket.
 *
 * An attachment reaches a message in two steps that can each fail:
 *
 *   upload object  →  register_message_attachment (pending row)  →  bound on send
 *
 * Between the two the object exists and nothing references it. Every path that
 * can end there has to clean up, which is why `remove` is separate, best
 * effort, and never throws: a failed cleanup must not turn into a failed user
 * action on top of whatever already went wrong.
 *
 * One gap remains and is deliberate rather than overlooked: if the upload
 * succeeds and the tab closes before `register`, the object is orphaned with
 * no client left to clean it up. Closing that needs a server-side sweep of
 * unreferenced objects, which is its own change (see the wave brief).
 */
export interface MessageAttachmentStorage {
  upload(path: string, file: File): Promise<void>
  remove(path: string): Promise<void>
  sign(path: string): Promise<string | null>
}

export class SupabaseMessageAttachmentStorage implements MessageAttachmentStorage {
  async upload(path: string, file: File) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600', contentType: file.type, upsert: false,
    })
    if (error) throw toMessagesError('messages.uploadAttachment', error)
  }

  async remove(path: string) {
    const { error } = await supabase.storage.from(BUCKET).remove([path])
    // Deliberately swallowed: this only ever runs while unwinding another
    // failure, and an orphaned object is cheaper than masking the real error.
    if (error) console.error('Failed to remove message attachment object:', error.message)
  }

  async sign(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ATTACHMENT_SIGNED_URL_SECONDS)
    if (error) {
      // An unsigned attachment renders as a placeholder; the message itself is
      // still readable, so this is not worth failing the load over.
      console.error('Failed to sign attachment URL:', error.message)
      return null
    }
    return data.signedUrl
  }
}
