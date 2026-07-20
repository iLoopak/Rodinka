import { GAME_CONFIG } from '../config/gameConfig'
import type { FallingClutterKind } from '../types/game'

export type EnvironmentDecoration = 'bubbles' | 'garden' | 'kitchen' | 'study' | 'toys'

export interface EnvironmentTheme {
  id: 'garden' | 'kitchen' | 'laundry' | 'playroom' | 'study'
  background: readonly [string, string, string]
  decoration: EnvironmentDecoration
  decorationColor: string
  secondaryDecorationColor: string
  clutterKinds: readonly FallingClutterKind[]
}

export interface EnvironmentBlend {
  current: EnvironmentTheme
  next: EnvironmentTheme
  progress: number
  segmentIndex: number
}

export const ENVIRONMENT_THEMES: readonly EnvironmentTheme[] = Object.freeze([
  Object.freeze({
    id: 'playroom',
    background: Object.freeze(['#EDF4EF', '#F8F1E9', '#FFF8EF']) as readonly [string, string, string],
    decoration: 'toys',
    decorationColor: 'rgba(151, 111, 135, .16)',
    secondaryDecorationColor: 'rgba(93, 139, 116, .14)',
    clutterKinds: Object.freeze(['block', 'ball']) as readonly FallingClutterKind[],
  }),
  Object.freeze({
    id: 'kitchen',
    background: Object.freeze(['#EAF3EE', '#F5F2E8', '#FFF9F1']) as readonly [string, string, string],
    decoration: 'kitchen',
    decorationColor: 'rgba(79, 128, 104, .15)',
    secondaryDecorationColor: 'rgba(181, 139, 91, .13)',
    clutterKinds: Object.freeze(['spoon', 'block']) as readonly FallingClutterKind[],
  }),
  Object.freeze({
    id: 'laundry',
    background: Object.freeze(['#EAF3F5', '#F2F5F0', '#FFF8F1']) as readonly [string, string, string],
    decoration: 'bubbles',
    decorationColor: 'rgba(91, 139, 153, .15)',
    secondaryDecorationColor: 'rgba(151, 111, 135, .12)',
    clutterKinds: Object.freeze(['sock', 'ball']) as readonly FallingClutterKind[],
  }),
  Object.freeze({
    id: 'study',
    background: Object.freeze(['#F0EFF6', '#F7F2E9', '#FFF9F1']) as readonly [string, string, string],
    decoration: 'study',
    decorationColor: 'rgba(104, 101, 151, .14)',
    secondaryDecorationColor: 'rgba(181, 139, 91, .12)',
    clutterKinds: Object.freeze(['paper', 'block']) as readonly FallingClutterKind[],
  }),
  Object.freeze({
    id: 'garden',
    background: Object.freeze(['#E8F3EC', '#F3F4E7', '#FFF8EF']) as readonly [string, string, string],
    decoration: 'garden',
    decorationColor: 'rgba(72, 132, 91, .15)',
    secondaryDecorationColor: 'rgba(113, 151, 165, .12)',
    clutterKinds: Object.freeze(['leaf', 'ball']) as readonly FallingClutterKind[],
  }),
])

const THEME_ORDERS = Object.freeze([
  Object.freeze([0, 1, 2, 3, 4]),
  Object.freeze([3, 4, 0, 1, 2]),
])

export function environmentBlendAtHeight(heightMeters: number): EnvironmentBlend {
  const safeHeight = Math.max(0, heightMeters)
  const segmentHeight = GAME_CONFIG.environment.segmentHeightMeters
  const segmentIndex = Math.floor(safeHeight / segmentHeight)
  const withinSegment = safeHeight - segmentIndex * segmentHeight
  const transitionStart = segmentHeight - GAME_CONFIG.environment.transitionMeters
  const linearProgress = clamp(
    (withinSegment - transitionStart) / GAME_CONFIG.environment.transitionMeters,
    0,
    1,
  )
  return {
    current: themeForSegment(segmentIndex),
    next: themeForSegment(segmentIndex + 1),
    progress: smoothStep(linearProgress),
    segmentIndex,
  }
}

export function themeForSegment(segmentIndex: number): EnvironmentTheme {
  const safeIndex = Math.max(0, Math.floor(segmentIndex))
  const cycle = Math.floor(safeIndex / ENVIRONMENT_THEMES.length)
  const position = safeIndex % ENVIRONMENT_THEMES.length
  const order = THEME_ORDERS[cycle % THEME_ORDERS.length]
  return ENVIRONMENT_THEMES[order[position]]
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value)
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
