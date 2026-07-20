export interface ManifestChunk {
  file: string
  src?: string
  isEntry?: boolean
  isDynamicEntry?: boolean
  imports?: string[]
  dynamicImports?: string[]
  css?: string[]
}

export interface EntrySizes {
  rawBytes: number
  gzipBytes: number
  eagerRawBytes: number
  eagerGzipBytes: number
  cssRawBytes: number
  cssGzipBytes: number
}

export interface RouteStylesheet {
  /** Stylesheet that must stay out of the main sheet. */
  stylesheet: string
  /** Route component importing it — Vite keys emitted CSS by importer. */
  owner: string
}

export declare const REQUIRED_ROUTE_MODULES: readonly string[]
export declare const REQUIRED_DEFERRED_MODULES: readonly string[]
export declare const REQUIRED_ROUTE_STYLESHEETS: readonly RouteStylesheet[]
export declare const ENTRY_BUDGET: EntrySizes
export declare function auditRouteChunks(
  manifest: Record<string, ManifestChunk>,
  sizes: EntrySizes,
  budget?: EntrySizes,
): string[]
