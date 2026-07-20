export interface ManifestChunk {
  file: string
  src?: string
  isEntry?: boolean
  isDynamicEntry?: boolean
  imports?: string[]
  dynamicImports?: string[]
}

export interface EntrySizes {
  rawBytes: number
  gzipBytes: number
  eagerRawBytes: number
  eagerGzipBytes: number
}

export declare const REQUIRED_ROUTE_MODULES: readonly string[]
export declare const ENTRY_BUDGET: EntrySizes
export declare function auditRouteChunks(
  manifest: Record<string, ManifestChunk>,
  sizes: EntrySizes,
  budget?: EntrySizes,
): string[]
