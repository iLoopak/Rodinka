import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { isNativeApp } from './capacitor'
import { registerAndroidBackButton } from './androidBack'
import { registerNativeDeepLinks } from './nativeDeepLinks'

let bootstrapped = false

/**
 * Native-only startup. Mirrors `registerRodinkaServiceWorker()`'s role for
 * the web build: called once from `main.tsx`, no-ops entirely on web/tests.
 */
export function bootstrapNativeApp() {
  if (!isNativeApp() || bootstrapped) return
  bootstrapped = true

  registerAndroidBackButton()
  registerNativeDeepLinks()

  // `Style.Dark` = dark icons/text, for use on a light background — Rodinka's
  // brand background (#FFF8F2) is light, so this (not `Style.Light`, which
  // is for dark backgrounds) is what keeps the status bar legible.
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined)
  void StatusBar.setBackgroundColor({ color: '#FFF8F2' }).catch(() => undefined)

  // Splash stays up (launchAutoHide: false in capacitor.config.ts) until the
  // first real frame has painted, so there's no white flash between the
  // native splash and the app shell.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void SplashScreen.hide().catch(() => undefined)
    })
  })
}

export function resetNativeAppBootstrapForTests() {
  bootstrapped = false
}
