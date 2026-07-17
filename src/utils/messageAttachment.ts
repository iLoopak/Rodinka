// Helpers for message photo attachments. Keeps validation, path
// building, and compression out of the composer/data-source so both
// sides can share a single source of truth and tests can exercise the
// rules without touching Supabase.

export const MESSAGE_ATTACHMENT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export type MessageAttachmentMimeType = (typeof MESSAGE_ATTACHMENT_ALLOWED_TYPES)[number]

// Composer accepts up to 10 MB from the camera roll; we compress to
// ≤ 8 MB before upload to match the storage bucket policy.
export const MESSAGE_ATTACHMENT_MAX_INPUT_BYTES = 10 * 1024 * 1024
export const MESSAGE_ATTACHMENT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const MESSAGE_ATTACHMENT_MAX_DIMENSION = 2000
export const MESSAGE_ATTACHMENT_QUALITY = 0.82

export type MessageAttachmentValidationError = 'empty' | 'unsupported' | 'too_large'

export function validateMessageAttachmentFile(
  file: Pick<File, 'type' | 'size'>,
): MessageAttachmentValidationError | null {
  if (file.size === 0) return 'empty'
  if (!MESSAGE_ATTACHMENT_ALLOWED_TYPES.includes(file.type as MessageAttachmentMimeType)) {
    return 'unsupported'
  }
  if (file.size > MESSAGE_ATTACHMENT_MAX_INPUT_BYTES) return 'too_large'
  return null
}

export function messageAttachmentExtension(mimeType: string): 'jpg' | 'png' | 'webp' | 'gif' {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  return 'jpg'
}

// Path layout — MUST stay in sync with can_write_message_attachment /
// validate_message_attachment_row in the migration. Storage policies
// pin uploads to <family_id>/<conversation_id>/<uuid>.<ext>.
export function buildMessageAttachmentPath(
  familyId: string,
  conversationId: string,
  extension: 'jpg' | 'png' | 'webp' | 'gif',
  uniqueId: string = crypto.randomUUID(),
): string {
  return `${familyId}/${conversationId}/${uniqueId}.${extension}`
}

// Best-effort client-side compression: any file over the upload limit
// is decoded, re-encoded as WebP (JPEG fallback), and shrunk to fit
// MESSAGE_ATTACHMENT_MAX_DIMENSION on its longest side. GIFs are left
// alone (compressing would strip animation frames — better to reject
// oversize GIFs at validation than silently kill the animation).
export interface CompressedMessageAttachment {
  file: File
  width: number
  height: number
}

export async function compressMessageAttachment(file: File): Promise<CompressedMessageAttachment> {
  if (file.type === 'image/gif') {
    return { file, width: 0, height: 0 }
  }
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
    // Non-browser environment (SSR/tests): return the raw file.
    return { file, width: 0, height: 0 }
  }
  const bitmap = await loadImageBitmap(file)
  try {
    const scale = Math.min(1, MESSAGE_ATTACHMENT_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale))
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale))
    const needsResize = targetWidth !== bitmap.width || targetHeight !== bitmap.height
    const needsRecode = file.size > MESSAGE_ATTACHMENT_MAX_UPLOAD_BYTES

    if (!needsResize && !needsRecode) {
      return { file, width: bitmap.width, height: bitmap.height }
    }

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) return { file, width: bitmap.width, height: bitmap.height }
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    let blob = await canvasBlob(canvas, 'image/webp', MESSAGE_ATTACHMENT_QUALITY)
    let extension: 'webp' | 'jpg' = 'webp'
    if (blob.type !== 'image/webp') {
      blob = await canvasBlob(canvas, 'image/jpeg', MESSAGE_ATTACHMENT_QUALITY)
      extension = 'jpg'
    }
    if (blob.size > MESSAGE_ATTACHMENT_MAX_UPLOAD_BYTES) {
      // One more pass at a lower quality — mobile photos with a lot of
      // detail can still exceed 8 MB even after resize.
      blob = await canvasBlob(canvas, 'image/jpeg', 0.7)
      extension = 'jpg'
    }
    const nextFile = new File([blob], `attachment.${extension}`, {
      type: extension === 'webp' ? 'image/webp' : 'image/jpeg',
      lastModified: Date.now(),
    })
    return { file: nextFile, width: targetWidth, height: targetHeight }
  } finally {
    if (typeof (bitmap as ImageBitmap).close === 'function') (bitmap as ImageBitmap).close()
  }
}

async function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image decoding failed'))
    }
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))),
      mimeType,
      quality,
    )
  })
}
