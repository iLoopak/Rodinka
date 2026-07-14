import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { registerRodinkaServiceWorker } from './push/registerServiceWorker'
import App from './App.tsx'

registerRodinkaServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
