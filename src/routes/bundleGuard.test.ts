import { describe, expect, it } from 'vitest'
import {
  auditRouteChunks,
  ENTRY_BUDGET,
  REQUIRED_DEFERRED_MODULES,
  REQUIRED_ROUTE_MODULES,
  REQUIRED_ROUTE_STYLESHEETS,
} from '../../scripts/check-route-chunks.mjs'
import type { ManifestChunk } from '../../scripts/check-route-chunks.mjs'

function healthyManifest() {
  const manifest: Record<string, ManifestChunk> = {
    'src/main.tsx': {
      file: 'assets/main.js',
      isEntry: true,
      dynamicImports: [...REQUIRED_DEFERRED_MODULES],
      css: ['assets/index.css'],
    },
  }
  REQUIRED_DEFERRED_MODULES.forEach((moduleId, index) => {
    manifest[moduleId] = {
      file: `assets/route-${index}.js`,
      src: moduleId,
      isDynamicEntry: true,
    }
  })
  REQUIRED_ROUTE_STYLESHEETS.forEach(({ owner }, index) => {
    manifest[owner] = { ...manifest[owner], css: [`assets/route-style-${index}.css`] }
  })
  return manifest
}

const withinBudget = {
  rawBytes: ENTRY_BUDGET.rawBytes - 1,
  gzipBytes: ENTRY_BUDGET.gzipBytes - 1,
  eagerRawBytes: ENTRY_BUDGET.eagerRawBytes - 1,
  eagerGzipBytes: ENTRY_BUDGET.eagerGzipBytes - 1,
  cssRawBytes: ENTRY_BUDGET.cssRawBytes - 1,
  cssGzipBytes: ENTRY_BUDGET.cssGzipBytes - 1,
}

describe('route chunk build guard', () => {
  it('accepts separate dynamic chunks under the entry budget', () => {
    expect(auditRouteChunks(healthyManifest(), withinBudget)).toEqual([])
  })

  it('catches a heavy route merged back into main', () => {
    const manifest = healthyManifest()
    manifest[REQUIRED_ROUTE_MODULES[1]].file = 'assets/main.js'
    manifest[REQUIRED_ROUTE_MODULES[1]].isDynamicEntry = false

    expect(auditRouteChunks(manifest, withinBudget).join('\n')).toContain('merged into the main entry chunk')
  })

  it('catches a main entry that exceeds the tolerant budget', () => {
    expect(auditRouteChunks(healthyManifest(), { ...withinBudget, rawBytes: ENTRY_BUDGET.rawBytes + 1 }).join('\n')).toContain('budget')
  })

  it('catches the Create Record wizard merged back into startup', () => {
    const manifest = healthyManifest()
    const wizard = 'src/components/create-record/CreateRecordWizard.tsx'
    manifest[wizard].file = 'assets/main.js'
    manifest[wizard].isDynamicEntry = false

    expect(auditRouteChunks(manifest, withinBudget).join('\n')).toContain('CreateRecordWizard.tsx was merged into the main entry chunk')
  })

  it('catches a main stylesheet that exceeds the tolerant budget', () => {
    expect(auditRouteChunks(healthyManifest(), { ...withinBudget, cssGzipBytes: ENTRY_BUDGET.cssGzipBytes + 1 }).join('\n'))
      .toContain('Main stylesheet')
  })

  it('catches route CSS folded back into the main stylesheet', () => {
    // The failure mode this guards: someone moves the import from the route
    // component up into a shared module, and every session downloads the chat
    // stylesheet again.
    const manifest = healthyManifest()
    manifest[REQUIRED_ROUTE_STYLESHEETS[1].owner].css = []

    expect(auditRouteChunks(manifest, withinBudget).join('\n'))
      .toContain('messages.css no longer ships with its route chunk')
  })

  it('catches route CSS emitted into the entry stylesheet', () => {
    const manifest = healthyManifest()
    manifest[REQUIRED_ROUTE_STYLESHEETS[0].owner].css = ['assets/index.css']

    expect(auditRouteChunks(manifest, withinBudget).join('\n'))
      .toContain('familyJump.css was merged into the main stylesheet')
  })
})
