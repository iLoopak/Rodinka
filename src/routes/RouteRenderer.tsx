import { lazy, Suspense, type LazyExoticComponent, type ComponentType } from 'react'
import { FamilyMark } from '../components/FamilyMark'
import { t } from '../strings'
import type { RouteDefinition } from './routeRegistry'

const lazyScreens = new WeakMap<RouteDefinition, LazyExoticComponent<ComponentType>>()

function screenFor(definition: RouteDefinition) {
  const existing = lazyScreens.get(definition)
  if (existing) return existing
  const screen = lazy(definition.load)
  lazyScreens.set(definition, screen)
  return screen
}

export function RouteRenderer({ definition }: { definition: RouteDefinition }) {
  const Screen = screenFor(definition)
  return (
    <Suspense fallback={<RouteLoadingFallback fullscreen={definition.shell === 'fullscreen'} />}>
      <Screen />
    </Suspense>
  )
}

export function RouteLoadingFallback({ fullscreen = false }: { fullscreen?: boolean }) {
  return (
    <div
      className={`route-loading${fullscreen ? ' is-fullscreen' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <FamilyMark variant="static" size={32} />
      <span>{t.loading.generic}</span>
    </div>
  )
}
