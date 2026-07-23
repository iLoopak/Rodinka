import { Capacitor } from '@capacitor/core'

export type NativePlatform = 'ios' | 'android' | 'web'

/**
 * True inside the Capacitor-wrapped native shell (iOS/Android app), false in
 * a plain browser tab or an installed PWA. `@capacitor/core` always ships a
 * web implementation of `Capacitor`, so this is safe to call unconditionally
 * — in tests (jsdom/vitest), in SSR-like contexts, and on the web build.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export function getNativePlatform(): NativePlatform {
  return Capacitor.getPlatform() as NativePlatform
}
