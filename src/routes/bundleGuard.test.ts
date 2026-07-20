import { describe, expect, it } from 'vitest'
import { auditRouteChunks, REQUIRED_ROUTE_MODULES } from '../../scripts/check-route-chunks.mjs'
import type { ManifestChunk } from '../../scripts/check-route-chunks.mjs'

function healthyManifest() {
  const manifest: Record<string, ManifestChunk> = {
    'src/main.tsx': {
      file: 'assets/main.js',
      isEntry: true,
      dynamicImports: [...REQUIRED_ROUTE_MODULES],
    },
  }
  REQUIRED_ROUTE_MODULES.forEach((moduleId, index) => {
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
      rawBytes: 800_000,
      gzipBytes: 250_000,
      eagerRawBytes: 900_000,
      eagerGzipBytes: 270_000,
    })).toEqual([])
  })

  it('catches a heavy route merged back into main', () => {
    const manifest = healthyManifest()
    manifest[REQUIRED_ROUTE_MODULES[1]].file = 'assets/main.js'
    manifest[REQUIRED_ROUTE_MODULES[1]].isDynamicEntry = false

    expect(auditRouteChunks(manifest, {
      rawBytes: 800_000,
      gzipBytes: 250_000,
      eagerRawBytes: 900_000,
      eagerGzipBytes: 270_000,
    }).join('\n')).toContain('merged into the main entry chunk')
  })

  it('catches a main entry that exceeds the tolerant budget', () => {
    expect(auditRouteChunks(healthyManifest(), {
      rawBytes: 1_050_001,
      gzipBytes: 310_001,
      eagerRawBytes: 950_001,
      eagerGzipBytes: 280_001,
    }).join('\n')).toContain('budget')
  })
})
