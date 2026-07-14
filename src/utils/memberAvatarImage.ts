export const MEMBER_AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MEMBER_AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024
export const MEMBER_AVATAR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MEMBER_AVATAR_MAX_DIMENSION = 1024

export type AvatarValidationError = 'empty' | 'unsupported' | 'too_large'

export function validateMemberAvatarFile(
  file: Pick<File, 'type' | 'size'>
): AvatarValidationError | null {
  if (file.size === 0) return 'empty'
  if (!MEMBER_AVATAR_ALLOWED_TYPES.includes(file.type as (typeof MEMBER_AVATAR_ALLOWED_TYPES)[number])) {
    return 'unsupported'
  }
  if (file.size > MEMBER_AVATAR_MAX_INPUT_BYTES) return 'too_large'
  return null
}

export function memberAvatarExtension(mimeType: string): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

export function buildMemberAvatarPath(
  familyId: string,
  memberId: string,
  extension: 'jpg' | 'png' | 'webp',
  uniqueId = crypto.randomUUID()
): string {
  return `${familyId}/${memberId}/${uniqueId}.${extension}`
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))),
      'image/webp',
      0.82
    )
  })
}

interface LoadedImage {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      }
    } catch {
      // Fall back to the image element path used by older mobile browsers.
    }
  }

  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Image decoding failed'))
      image.src = objectUrl
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export async function optimizeMemberAvatar(file: File): Promise<File> {
  const image = await loadImage(file)
  try {
    const scale = Math.min(1, MEMBER_AVATAR_MAX_DIMENSION / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    context.drawImage(image.source, 0, 0, width, height)
    const blob = await canvasBlob(canvas)
    if (blob.size === 0 || blob.size > MEMBER_AVATAR_MAX_UPLOAD_BYTES) {
      throw new Error('Optimized image exceeds the upload limit')
    }
    return new File([blob], 'member-avatar.webp', { type: 'image/webp' })
  } finally {
    image.cleanup()
  }
}
