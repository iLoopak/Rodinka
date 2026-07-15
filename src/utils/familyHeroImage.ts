import {
  MEMBER_AVATAR_MAX_UPLOAD_BYTES,
  MEMBER_AVATAR_MAX_ZOOM,
  validateMemberAvatarFile,
  type AvatarCropTransform,
  type AvatarValidationError,
  type LoadedMemberAvatarImage,
} from './memberAvatarImage'

export const FAMILY_HERO_ASPECT_RATIO = 16 / 7
export const FAMILY_HERO_OUTPUT_WIDTH = 1600
export const FAMILY_HERO_OUTPUT_HEIGHT = 700
export const FAMILY_HERO_CROPPED_PREFIX = 'family-hero-cropped.'

export type FamilyHeroValidationError = AvatarValidationError

export interface FamilyHeroCropGeometry {
  renderedWidth: number
  renderedHeight: number
  x: number
  y: number
}

export function validateFamilyHeroFile(file: Pick<File, 'type' | 'size'>): FamilyHeroValidationError | null {
  return validateMemberAvatarFile(file)
}

export function buildFamilyHeroPath(familyId: string, extension: 'jpg' | 'webp', uniqueId: string = crypto.randomUUID()) {
  return `${familyId}/${uniqueId}.${extension}`
}

export function familyHeroCropGeometry(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  transform: AvatarCropTransform,
): FamilyHeroCropGeometry {
  const scale = Math.max(viewportWidth / imageWidth, viewportHeight / imageHeight) * transform.zoom
  const renderedWidth = imageWidth * scale
  const renderedHeight = imageHeight * scale
  return {
    renderedWidth,
    renderedHeight,
    x: (viewportWidth - renderedWidth) / 2 + transform.offsetX,
    y: (viewportHeight - renderedHeight) / 2 + transform.offsetY,
  }
}

export function clampFamilyHeroCropTransform(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  transform: AvatarCropTransform,
): AvatarCropTransform {
  const zoom = Math.min(MEMBER_AVATAR_MAX_ZOOM, Math.max(1, transform.zoom))
  const geometry = familyHeroCropGeometry(imageWidth, imageHeight, viewportWidth, viewportHeight, { ...transform, zoom })
  const maxOffsetX = Math.max(0, (geometry.renderedWidth - viewportWidth) / 2)
  const maxOffsetY = Math.max(0, (geometry.renderedHeight - viewportHeight) / 2)
  return {
    zoom,
    offsetX: Math.min(maxOffsetX, Math.max(-maxOffsetX, transform.offsetX)),
    offsetY: Math.min(maxOffsetY, Math.max(-maxOffsetY, transform.offsetY)),
  }
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image encoding failed')), mimeType, quality)
  })
}

export async function createCroppedFamilyHero(
  image: Pick<LoadedMemberAvatarImage, 'source' | 'width' | 'height'>,
  viewportWidth: number,
  viewportHeight: number,
  transform: AvatarCropTransform,
): Promise<File> {
  const safeTransform = clampFamilyHeroCropTransform(
    image.width,
    image.height,
    viewportWidth,
    viewportHeight,
    transform,
  )
  const geometry = familyHeroCropGeometry(image.width, image.height, viewportWidth, viewportHeight, safeTransform)
  const canvas = document.createElement('canvas')
  canvas.width = FAMILY_HERO_OUTPUT_WIDTH
  canvas.height = FAMILY_HERO_OUTPUT_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  const scaleX = FAMILY_HERO_OUTPUT_WIDTH / viewportWidth
  const scaleY = FAMILY_HERO_OUTPUT_HEIGHT / viewportHeight
  context.drawImage(
    image.source,
    geometry.x * scaleX,
    geometry.y * scaleY,
    geometry.renderedWidth * scaleX,
    geometry.renderedHeight * scaleY,
  )
  let blob = await canvasBlob(canvas, 'image/webp', 0.84)
  let extension: 'webp' | 'jpg' = 'webp'
  if (blob.type !== 'image/webp') {
    blob = await canvasBlob(canvas, 'image/jpeg', 0.88)
    extension = 'jpg'
  }
  if (blob.size === 0 || blob.size > MEMBER_AVATAR_MAX_UPLOAD_BYTES) {
    throw new Error('Cropped image exceeds the upload limit')
  }
  return new File([blob], `family-hero-cropped.${extension}`, {
    type: extension === 'webp' ? 'image/webp' : 'image/jpeg',
    lastModified: Date.now(),
  })
}
