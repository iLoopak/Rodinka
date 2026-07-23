import { Browser } from '@capacitor/browser'
import { isNativeApp } from './capacitor'

/**
 * Opens a URL outside the app shell: the system browser natively, a new tab
 * on the web. Never navigates the current WebView/tab to a third-party
 * origin — that would strand the user outside the app with no way back.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNativeApp()) {
    await Browser.open({ url })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
