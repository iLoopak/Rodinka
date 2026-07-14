export function registerRodinkaServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('Service worker registration failed:', error instanceof Error ? error.message : 'unknown error')
    })
  })
}

