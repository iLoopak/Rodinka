import { describe, expect, it } from 'vitest'
import { auditRouteChunks, ENTRY_BUDGET, REQUIRED_DEFERRED_MODULES, REQUIRED_ROUTE_MODULES } from '../../scripts/check-route-chunks.mjs'
import type { ManifestChunk } from '../../scripts/check-route-chunks.mjs'

function healthyManifest() {
  const manifest: Record<string, ManifestChunk> = {
    'src/main.tsx': {
      file: 'assets/main.js',
      isEntry: true,
      dynamicImports: [...REQUIRED_DEFERRED_MODULES],
    },
  }
  REQUIRED_DEFERRED_MODULES.forEach((moduleId, index) => {
    manifest[moduleId] = {
      file: `assets/route-${index}.js`,
      src: moduleId,
      isDynamicEntry: true,
    }
  })
  return manifest
}

describe('route chunk build guard', () => {
  it('accepts separate dynamic chunks under the entry budget', () => {
    expect(auditRouteChunks(healthyManifest(), {
      rawBytes: ENTRY_BUDGET.rawBytes - 1,
      gzipBytes: ENTRY_BUDGET.gzipBytes - 1,
      eagerRawBytes: ENTRY_BUDGET.eagerRawBytes - 1,
      eagerGzipBytes: ENTRY_BUDGET.eagerGzipBytes - 1,
    })).toEqual([])
  })

  it('catches a heavy route merged back into main', () => {
    const manifest = healthyManifest()
    manifest[REQUIRED_ROUTE_MODULES[1]].file = 'assets/main.js'
    manifest[REQUIRED_ROUTE_MODULES[1]].isDynamicEntry = false

    expect(auditRouteChunks(manifest, {
      rawBytes: ENTRY_BUDGET.rawBytes - 1,
      gzipBytes: ENTRY_BUDGET.gzipBytes - 1,
      eagerRawBytes: ENTRY_BUDGET.eagerRawBytes - 1,
      eagerGzipBytes: ENTRY_BUDGET.eagerGzipBytes - 1,
    }).join('\n')).toContain('merged into the main entry chunk')
  })

  it('catches a main entry that exceeds the tolerant budget', () => {
    expect(auditRouteChunks(healthyManifest(), {
      rawBytes: ENTRY_BUDGET.rawBytes + 1,
      gzipBytes: ENTRY_BUDGET.gzipBytes + 1,
      eagerRawBytes: ENTRY_BUDGET.eagerRawBytes + 1,
      eagerGzipBytes: ENTRY_BUDGET.eagerGzipBytes + 1,
    }).join('\n')).toContain('budget')
  })

  it('catches the Create Record wizard merged back into startup', () => {
    const manifest = healthyManifest()
    const wizard = 'src/components/create-record/CreateRecordWizard.tsx'
    manifest[wizard].file = 'assets/main.js'
    manifest[wizard].isDynamicEntry = false

    expect(auditRouteChunks(manifest, {
      rawBytes: ENTRY_BUDGET.rawBytes - 1,
      gzipBytes: ENTRY_BUDGET.gzipBytes - 1,
      eagerRawBytes: ENTRY_BUDGET.eagerRawBytes - 1,
      eagerGzipBytes: ENTRY_BUDGET.eagerGzipBytes - 1,
    }).join('\n')).toContain('CreateRecordWizard.tsx was merged into the main entry chunk')
  })
})
