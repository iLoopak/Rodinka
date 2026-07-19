import { useEffect, useState } from 'react'
import { getBrowserNetworkStatus, type NetworkStatus } from './networkStatus'

export function useNetworkStatus(): NetworkStatus {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(() => getBrowserNetworkStatus())

  useEffect(() => {
    const setOnline = () => setNetworkStatus('online')
    const setOffline = () => setNetworkStatus('offline')
    window.addEventListener('online', setOnline)
    window.addEventListener('offline', setOffline)
    setNetworkStatus(getBrowserNetworkStatus())
    return () => {
      window.removeEventListener('online', setOnline)
      window.removeEventListener('offline', setOffline)
    }
  }, [])

  return networkStatus
}
