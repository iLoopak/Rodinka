import { cosmeticByKey } from './cosmeticDefinitions'
import { cosmeticAnchors, type CosmeticAnchors } from './cosmeticAnchors'
import type { EquippedCosmetics, FamilyJumpCosmeticSlot } from './cosmeticTypes'

export const COSMETIC_RENDER_ORDER: readonly FamilyJumpCosmeticSlot[] = ['feet', 'neck', 'face', 'head']

export function renderEquippedCosmetics(context: CanvasRenderingContext2D, equipped: EquippedCosmetics, width: number, height: number) {
  const anchors = cosmeticAnchors(width, height)
  for (const slot of COSMETIC_RENDER_ORDER) {
    const key = equipped[slot]
    if (key && cosmeticByKey(key)?.slot === slot) drawCosmetic(context, key, anchors, width)
  }
}

export function drawCosmetic(context: CanvasRenderingContext2D, key: string, anchors: CosmeticAnchors, width = 46) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = Math.max(1.5, width / 24)
  context.strokeStyle = '#4d554f'
  context.fillStyle = '#f4e7cf'
  if (key === 'round-glasses') {
    const { x, y } = anchors.faceAnchor
    context.beginPath(); context.arc(x - 7, y, 5, 0, Math.PI * 2); context.arc(x + 7, y, 5, 0, Math.PI * 2); context.moveTo(x - 2, y); context.lineTo(x + 2, y); context.stroke()
  } else if (key === 'bow-tie') {
    const { x, y } = anchors.neckAnchor
    context.fillStyle = '#c88476'; context.beginPath(); context.moveTo(x, y); context.lineTo(x - 10, y - 6); context.lineTo(x - 10, y + 6); context.closePath(); context.moveTo(x, y); context.lineTo(x + 10, y - 6); context.lineTo(x + 10, y + 6); context.closePath(); context.fill(); context.stroke()
  } else if (key === 'jumper-hat') {
    const { x, y } = anchors.headAnchor
    context.fillStyle = '#8ba79a'; context.beginPath(); context.moveTo(x - 14, y); context.lineTo(x - 10, y - 11); context.quadraticCurveTo(x, y - 18, x + 10, y - 11); context.lineTo(x + 14, y); context.closePath(); context.fill(); context.stroke(); context.beginPath(); context.moveTo(x - 18, y); context.lineTo(x + 18, y); context.stroke()
  } else if (key === 'record-tie') {
    const { x, y } = anchors.neckAnchor
    context.fillStyle = '#b27a68'; context.beginPath(); context.moveTo(x - 4, y - 4); context.lineTo(x + 4, y - 4); context.lineTo(x + 6, y + 12); context.lineTo(x, y + 17); context.lineTo(x - 6, y + 12); context.closePath(); context.fill(); context.stroke()
  } else if (key === 'striped-socks') {
    for (const foot of [anchors.leftFootAnchor, anchors.rightFootAnchor]) { context.strokeStyle = '#eee4d2'; context.lineWidth = 5; context.beginPath(); context.moveTo(foot.x, foot.y - 6); context.lineTo(foot.x, foot.y + 4); context.stroke(); context.strokeStyle = '#9d766f'; context.lineWidth = 1.5; context.beginPath(); context.moveTo(foot.x - 2.5, foot.y - 2); context.lineTo(foot.x + 2.5, foot.y - 2); context.stroke() }
  } else if (key === 'family-crown') {
    const { x, y } = anchors.headAnchor
    context.fillStyle = '#dfbd67'; context.beginPath(); context.moveTo(x - 13, y); context.lineTo(x - 12, y - 14); context.lineTo(x - 5, y - 7); context.lineTo(x, y - 17); context.lineTo(x + 5, y - 7); context.lineTo(x + 12, y - 14); context.lineTo(x + 13, y); context.closePath(); context.fill(); context.stroke()
  }
  context.restore()
}

export function renderCosmeticAnchors(context: CanvasRenderingContext2D, width: number, height: number) {
  const anchors = cosmeticAnchors(width, height)
  context.save(); context.fillStyle = '#9c3e3e'
  for (const point of Object.values(anchors)) { context.beginPath(); context.arc(point.x, point.y, 2.5, 0, Math.PI * 2); context.fill() }
  context.restore()
}
