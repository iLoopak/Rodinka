import { useEffect, useRef, useState } from 'react'
import type { FamilyLogoAnimationMode } from '../components/FamilyMark'

interface FamilyLogoAnimationOptions {
  baseMode?: Extract<FamilyLogoAnimationMode, 'idle' | 'member-focus'>
  connectionInterrupted: boolean
  connectionReady: boolean
  restoredDurationMs?: number
}

// Keeps the mark in a reconnecting wave until every app-wide signal is healthy,
// then plays the restored animation once before returning to its contextual mode.
export function useFamilyLogoAnimation({
  baseMode = 'idle',
  connectionInterrupted,
  connectionReady,
  restoredDurationMs = 1100,
}: FamilyLogoAnimationOptions): FamilyLogoAnimationMode {
  const recovering = useRef(connectionInterrupted)
  const [mode, setMode] = useState<FamilyLogoAnimationMode>(
    connectionInterrupted ? 'reconnecting' : baseMode,
  )

  useEffect(() => {
    if (connectionInterrupted) {
      recovering.current = true
      setMode('reconnecting')
      return
    }

    if (!recovering.current) {
      setMode(baseMode)
      return
    }

    if (!connectionReady) {
      setMode('reconnecting')
      return
    }

    recovering.current = false
    setMode('connection-restored')
    const timeout = window.setTimeout(() => setMode(baseMode), restoredDurationMs)
    return () => window.clearTimeout(timeout)
  }, [baseMode, connectionInterrupted, connectionReady, restoredDurationMs])

  return mode
}
