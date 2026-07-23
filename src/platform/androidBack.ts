import { App } from '@capacitor/app'
import { dismissTopmost, hasDismissable } from './backDismiss'

export type BackAction = 'dismiss' | 'back' | 'minimize'

/** Pure decision logic, independent of Capacitor/DOM — trivial to unit test. */
export function decideBackAction(input: { hasDismissable: boolean; canGoBack: boolean }): BackAction {
  if (input.hasDismissable) return 'dismiss'
  if (input.canGoBack) return 'back'
  return 'minimize'
}

let unregister: (() => void) | null = null

/**
 * Registers the Android hardware back button once for the app's lifetime.
 * Root screen with nothing open backgrounds the app (`minimizeApp`) instead
 * of exiting or piling up history, per Capacitor's own guidance — killing
 * the process on back is jarring and not how any other Android app behaves.
 */
export function registerAndroidBackButton() {
  if (unregister) return
  const listenerPromise = App.addListener('backButton', ({ canGoBack }) => {
    switch (decideBackAction({ hasDismissable: hasDismissable(), canGoBack })) {
      case 'dismiss':
        dismissTopmost()
        return
      case 'back':
        window.history.back()
        return
      case 'minimize':
        void App.minimizeApp()
    }
  })
  unregister = () => { void listenerPromise.then((handle) => handle.remove()) }
}

export function unregisterAndroidBackButtonForTests() {
  unregister?.()
  unregister = null
}
