import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { registerRodinkaServiceWorker } from './push/registerServiceWorker'
import App from './App.tsx'
import { LanguageProvider } from './i18n/LanguageProvider'
import './i18n'

registerRodinkaServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
