import { useCallback, useEffect, useState } from 'react'
import { isNativeApp } from '../platform/capacitor'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

// Drives the "Install app" UI. Chrome/Edge/Android expose a real
// programmatic prompt via `beforeinstallprompt`; iOS Safari never fires
// that event, so callers should fall back to manual "Share → Add to Home
// Screen" instructions when `showIOSInstructions` is true. Everything
// stays false/no-op once the app is already installed or running inside
// a future Capacitor build.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (isNativeApp()) return

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    function handleAppInstalled() {
      setDeferredPrompt(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (choice.outcome === 'accepted') setInstalled(true)
  }, [deferredPrompt])

  const native = isNativeApp()
  const standalone = installed || isStandaloneDisplay()

  return {
    canPrompt: !native && !standalone && deferredPrompt !== null,
    showIOSInstructions: !native && !standalone && deferredPrompt === null && isIOSDevice(),
    isStandalone: standalone,
    isNative: native,
    promptInstall,
  }
}
