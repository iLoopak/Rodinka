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
import './i18n'

registerRodinkaServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ServiceWorkerUpdateBanner />
      <App />
    </LanguageProvider>
  </StrictMode>,
)
