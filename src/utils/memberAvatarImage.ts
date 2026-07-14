export const MEMBER_AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MEMBER_AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024
export const MEMBER_AVATAR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MEMBER_AVATAR_MAX_DIMENSION = 1024
export const MEMBER_AVATAR_CROP_SIZE = 512
export const MEMBER_AVATAR_CROP_QUALITY = 0.86
export const MEMBER_AVATAR_CROPPED_FILENAME = 'member-avatar-cropped.webp'
export const MEMBER_AVATAR_CROPPED_PREFIX = 'member-avatar-cropped.'
export const MEMBER_AVATAR_MAX_ZOOM = 4

export interface AvatarCropTransform {
  zoom: number
  offsetX: number
  offsetY: number
}

export interface AvatarCropGeometry {
  scale: number
  renderedWidth: number
  renderedHeight: number
  x: number
  y: number
}

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

async function canvasBlob(
  canvas: HTMLCanvasElement,
  mimeType = 'image/webp',
  quality = 0.82
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))),
      mimeType,
      quality
    )
  })
}

export interface LoadedMemberAvatarImage {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

export async function loadMemberAvatarImage(file: File): Promise<LoadedMemberAvatarImage> {
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

export function initialAvatarCropTransform(): AvatarCropTransform {
  return { zoom: 1, offsetX: 0, offsetY: 0 }
}

export function avatarCropGeometry(
  imageWidth: number,
  imageHeight: number,
  viewportSize: number,
  transform: AvatarCropTransform
): AvatarCropGeometry {
  const baseScale = Math.max(viewportSize / imageWidth, viewportSize / imageHeight)
  const scale = baseScale * transform.zoom
  const renderedWidth = imageWidth * scale
  const renderedHeight = imageHeight * scale
  return {
    scale,
    renderedWidth,
    renderedHeight,
    x: (viewportSize - renderedWidth) / 2 + transform.offsetX,
    y: (viewportSize - renderedHeight) / 2 + transform.offsetY,
  }
}

export function clampAvatarCropTransform(
  imageWidth: number,
  imageHeight: number,
  viewportSize: number,
  transform: AvatarCropTransform
): AvatarCropTransform {
  const zoom = Math.min(MEMBER_AVATAR_MAX_ZOOM, Math.max(1, transform.zoom))
  const geometry = avatarCropGeometry(imageWidth, imageHeight, viewportSize, { ...transform, zoom })
  const maxOffsetX = Math.max(0, (geometry.renderedWidth - viewportSize) / 2)
  const maxOffsetY = Math.max(0, (geometry.renderedHeight - viewportSize) / 2)
  return {
    zoom,
    offsetX: Math.min(maxOffsetX, Math.max(-maxOffsetX, transform.offsetX)),
    offsetY: Math.min(maxOffsetY, Math.max(-maxOffsetY, transform.offsetY)),
  }
}

export async function createCroppedMemberAvatar(
  image: Pick<LoadedMemberAvatarImage, 'source' | 'width' | 'height'>,
  viewportSize: number,
  transform: AvatarCropTransform
): Promise<File> {
  const safeTransform = clampAvatarCropTransform(
    image.width,
    image.height,
    viewportSize,
    transform
  )
  const geometry = avatarCropGeometry(image.width, image.height, viewportSize, safeTransform)
  const canvas = document.createElement('canvas')
  canvas.width = MEMBER_AVATAR_CROP_SIZE
  canvas.height = MEMBER_AVATAR_CROP_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  const outputScale = MEMBER_AVATAR_CROP_SIZE / viewportSize
  context.drawImage(
    image.source,
    geometry.x * outputScale,
    geometry.y * outputScale,
    geometry.renderedWidth * outputScale,
    geometry.renderedHeight * outputScale
  )
  let blob = await canvasBlob(canvas, 'image/webp', MEMBER_AVATAR_CROP_QUALITY)
  if (blob.type !== 'image/webp') {
    blob = await canvasBlob(canvas, 'image/jpeg', 0.9)
  }
  if (blob.size === 0 || blob.size > MEMBER_AVATAR_MAX_UPLOAD_BYTES) {
    throw new Error('Cropped image exceeds the upload limit')
  }
  const isWebp = blob.type === 'image/webp'
  return new File([blob], isWebp ? MEMBER_AVATAR_CROPPED_FILENAME : 'member-avatar-cropped.jpg', {
    type: isWebp ? 'image/webp' : 'image/jpeg',
    lastModified: Date.now(),
  })
}

export async function optimizeMemberAvatar(file: File): Promise<File> {
  const image = await loadMemberAvatarImage(file)
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
