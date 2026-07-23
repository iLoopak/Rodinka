import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/800.css'
import './index.css'
import { registerRodinkaServiceWorker } from './push/serviceWorkerUpdates'
import App from './App.tsx'
import { ServiceWorkerUpdateBanner } from './components/ServiceWorkerUpdateBanner'
import { LanguageProvider } from './i18n/LanguageProvider'
import { isNativeApp } from './platform/capacitor'
import './i18n'

// Service worker (offline cache + Web Push) is a browser/PWA-only concern;
// the Capacitor shell gets its own native lifecycle instead. Never both.
// Dynamically imported so the (Capacitor App/Browser/StatusBar/SplashScreen)
// native-only code never lands in the eager web bundle.
if (isNativeApp()) void import('./platform/lifecycle').then(({ bootstrapNativeApp }) => bootstrapNativeApp())
else registerRodinkaServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ServiceWorkerUpdateBanner />
      <App />
    </LanguageProvider>
  </StrictMode>,
)
