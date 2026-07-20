import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { t } from '../../strings'
import { friendly } from '../../utils/friendlyError'
import { getShoppingLocalStore } from '../../shopping/shoppingIndexedDb'
import { buildFamilyHeroPath, validateFamilyHeroFile } from '../../utils/familyHeroImage'
import { defaultShoppingCategorySettings, normalizeShoppingCategorySettings, type ShoppingCategorySettings } from '../../utils/shoppingCategorySettings'
import { FAMILY_HERO_SIGNED_URL_SECONDS, SupabaseFamilyMediaStorage } from '../../features/family/data/familyMediaStorage'
import { SupabaseFamilySettingsRepository } from '../../features/family/data/supabaseFamilyRepository'
import type { FamilySettingsRepository } from '../../features/family/data/familyRepository'
import { cachedQuery, cacheTimes, familyQueryKey, invalidateQueryCache, signedUrlMaxAgeMs } from '../../queryCache'
import type { RealtimeConnectionState } from '../../realtime/connectionState'


interface FamilySettingsContextValue {
  familyName: string | null
  familyNameLoading: boolean
  familyNameError: string | null
  familyHeroImagePath: string | null
  familyHeroImageUrl: string | null
  shoppingCategorySettings: ShoppingCategorySettings
  settingsRealtimeStatus: RealtimeConnectionState
  updateFamilyName: (name: string) => Promise<void>
  updateFamilyHeroImage: (file: File | null) => Promise<void>
  updateShoppingCategorySettings: (settings: ShoppingCategorySettings) => Promise<void>
  refreshFamilySettings: () => Promise<void>
}

const FamilySettingsContext = createContext<FamilySettingsContextValue | null>(null)

interface ProviderProps {
  familyId: string
  userId: string
  children: ReactNode
  repository?: FamilySettingsRepository
}

export function FamilySettingsProvider({ familyId, userId, children, repository: repositoryOverride }: ProviderProps) {
  const storage = useMemo(() => new SupabaseFamilyMediaStorage(), [])
  const repository = useMemo(() => repositoryOverride ?? new SupabaseFamilySettingsRepository(storage), [repositoryOverride, storage])
  const scope = useMemo(() => ({ familyId }), [familyId])
  const activeFamilyIdRef = useRef(familyId)
  activeFamilyIdRef.current = familyId

  const [familyNameState, setFamilyNameState] = useState<{
    familyId: string | null
    name: string | null
    heroImagePath: string | null
    heroImageUrl: string | null
    shoppingCategorySettings: ShoppingCategorySettings
    loading: boolean
  }>({ familyId: null, name: null, heroImagePath: null, heroImageUrl: null, shoppingCategorySettings: defaultShoppingCategorySettings(), loading: true })
  const [error, setError] = useState<string | null>(null)

  const familyName = familyNameState.familyId === familyId ? familyNameState.name : null
  const familyHeroImagePath = familyNameState.familyId === familyId ? familyNameState.heroImagePath : null
  const familyHeroImageUrl = familyNameState.familyId === familyId ? familyNameState.heroImageUrl : null
  const shoppingCategorySettings = familyNameState.familyId === familyId ? familyNameState.shoppingCategorySettings : defaultShoppingCategorySettings()
  const familyNameLoading = familyNameState.familyId !== familyId || familyNameState.loading

  const refreshFamilySettings = useCallback(async () => {
    const cachedCategorySettings = await getShoppingLocalStore().loadCategorySettings(familyId)
    setFamilyNameState({ familyId, name: null, heroImagePath: null, heroImageUrl: null, shoppingCategorySettings: cachedCategorySettings ?? defaultShoppingCategorySettings(), loading: true })
    try {
      const { data } = await cachedQuery({
        key: familyQueryKey('settings', familyId),
        scope: { userId, familyId },
        staleTimeMs: cacheTimes.stable,
        maxAgeMs: signedUrlMaxAgeMs(FAMILY_HERO_SIGNED_URL_SECONDS),
        persist: true,
        queryName: 'family.settings',
        table: 'families,family-hero-images',
        reason: 'mount',
        fetcher: async () => {
          const settings = await repository.loadSettings(scope)
          return {
            name: settings.name,
            heroImagePath: settings.heroImagePath,
            heroImageUrl: settings.heroImageUrl,
            shoppingCategorySettings: normalizeShoppingCategorySettings(settings.shoppingCategorySettingsRaw),
          }
        },
      })
      if (activeFamilyIdRef.current !== familyId) return
      await getShoppingLocalStore().saveCategorySettings(familyId, data.shoppingCategorySettings)
      setFamilyNameState({ familyId, name: data.name, heroImagePath: data.heroImagePath, heroImageUrl: data.heroImageUrl, shoppingCategorySettings: data.shoppingCategorySettings, loading: false })
      setError(null)
    } catch (loadError) {
      if (activeFamilyIdRef.current !== familyId) return
      console.error('Failed to load family name:', loadError instanceof Error ? loadError.message : 'unknown error')
      setError(t.errors.loadFailed)
      setFamilyNameState({ familyId, name: null, heroImagePath: null, heroImageUrl: null, shoppingCategorySettings: cachedCategorySettings ?? defaultShoppingCategorySettings(), loading: false })
    }
  }, [familyId, repository, scope, userId])

  const updateFamilyName = useCallback(async (name: string) => {
    const normalized = name.trim().replace(/\s+/g, ' ')
    if (!normalized) throw new Error(t.errors.generic)
    try {
      await repository.updateSettings(scope, { name: normalized })
    } catch (updateError) {
      throw friendly(updateError)
    }
    if (activeFamilyIdRef.current !== familyId) return
    setFamilyNameState((current) => ({ ...current, familyId, name: normalized, loading: false }))
    void invalidateQueryCache(familyQueryKey('settings', familyId), { userId, familyId })
    setError(null)
  }, [familyId, repository, scope, userId])

  const updateShoppingCategorySettings = useCallback(async (settings: ShoppingCategorySettings) => {
    const normalized = normalizeShoppingCategorySettings(settings)
    try {
      await repository.updateSettings(scope, { shoppingCategorySettings: normalized })
    } catch (updateError) {
      throw friendly(updateError)
    }
    await getShoppingLocalStore().saveCategorySettings(familyId, normalized)
    if (activeFamilyIdRef.current !== familyId) return
    setFamilyNameState((current) => ({ ...current, familyId, shoppingCategorySettings: normalized, loading: false }))
    void invalidateQueryCache(familyQueryKey('settings', familyId), { userId, familyId })
  }, [familyId, repository, scope, userId])

  const updateFamilyHeroImage = useCallback(async (file: File | null) => {
    const previousPath = familyNameState.familyId === familyId ? familyNameState.heroImagePath : null
    let uploadedPath: string | null = null
    let nextUrl: string | null = null

    if (file) {
      if (validateFamilyHeroFile(file)) throw new Error(t.errors.generic)
      const extension = file.type === 'image/webp' ? 'webp' : 'jpg'
      uploadedPath = buildFamilyHeroPath(familyId, extension)
      try {
        await storage.uploadHeroImage(uploadedPath, file)
      } catch (uploadError) {
        throw friendly(uploadError)
      }
      nextUrl = await storage.signHeroImage(uploadedPath)
      if (!nextUrl) {
        // Uploaded but unusable: remove it rather than pointing the family
        // header at an object nobody can read.
        await storage.removeHeroImage(uploadedPath)
        throw new Error(t.errors.generic)
      }
    }

    const nextPath = uploadedPath
    try {
      await repository.updateSettings(scope, { heroImagePath: nextPath })
    } catch (saveError) {
      if (uploadedPath) await storage.removeHeroImage(uploadedPath)
      throw friendly(saveError)
    }
    if (activeFamilyIdRef.current !== familyId) return
    setFamilyNameState((current) => ({ ...current, familyId, heroImagePath: nextPath, heroImageUrl: nextUrl, loading: false }))
    void invalidateQueryCache(familyQueryKey('settings', familyId), { userId, familyId })
    if (previousPath && previousPath !== nextPath) await storage.removeHeroImage(previousPath)
  }, [familyId, familyNameState, repository, scope, storage, userId])

  useEffect(() => {
    refreshFamilySettings()
  }, [refreshFamilySettings])

  const [settingsRealtimeStatus, setSettingsRealtimeStatus] = useState<RealtimeConnectionState>('connecting')

  // families is one row per family — INSERT/DELETE never happen in normal
  // use, only UPDATE. A realtime echo of our own update just re-applies the
  // same values (harmless, single-row table, nothing to duplicate).
  const applyFamilySettingsRow = useCallback(async (row: Record<string, unknown>) => {
    const heroImagePath = (row.hero_image_path as string | null) ?? null
    const heroImageUrl = heroImagePath ? await storage.signHeroImage(heroImagePath) : null
    const nextCategorySettings = normalizeShoppingCategorySettings(row.shopping_category_settings)
    await getShoppingLocalStore().saveCategorySettings(familyId, nextCategorySettings)
    if (activeFamilyIdRef.current !== familyId) return
    setFamilyNameState({
      familyId,
      name: (row.name as string | null) ?? null,
      heroImagePath,
      heroImageUrl,
      shoppingCategorySettings: nextCategorySettings,
      loading: false,
    })
    setError(null)
  }, [familyId, storage])

  useEffect(() => {
    if (!familyId) return
    return repository.subscribe(scope, {
      onStatusChange: (status) => setSettingsRealtimeStatus(status as RealtimeConnectionState),
      onSettingsChange: (row) => void applyFamilySettingsRow(row),
    })
  }, [applyFamilySettingsRow, familyId, repository, scope])

  const value: FamilySettingsContextValue = {
    familyName,
    familyNameLoading,
    familyNameError: error,
    familyHeroImagePath,
    familyHeroImageUrl,
    shoppingCategorySettings,
    settingsRealtimeStatus,
    updateFamilyName,
    updateFamilyHeroImage,
    updateShoppingCategorySettings,
    refreshFamilySettings,
  }

  return <FamilySettingsContext.Provider value={value}>{children}</FamilySettingsContext.Provider>
}

export function useFamilySettings() {
  const ctx = useContext(FamilySettingsContext)
  if (!ctx) throw new Error('useFamilySettings must be used within a FamilySettingsProvider')
  return ctx
}
