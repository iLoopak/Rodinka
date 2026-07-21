import { useEffect } from 'react'
import { useRouterActions } from '../router'
import { RouteLoadingFallback } from './RouteRenderer'
export function LegacyFamilyJumpRedirect() { const { navigate } = useRouterActions(); useEffect(() => { navigate('/arcade/family-jump') }, [navigate]); return <RouteLoadingFallback fullscreen /> }
