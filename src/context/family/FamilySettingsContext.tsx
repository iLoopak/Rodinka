import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../supabaseClient'
import { t } from '../../strings'
import { friendly } from '../../utils/friendlyError'
import { getShoppingLocalStore } from '../../shopping/shoppingIndexedDb'
import { buildFamilyHeroPath, validateFamilyHeroFile } from '../../utils/familyHeroImage'
import { defaultShoppingCategorySettings, normalizeShoppingCategorySettings, type ShoppingCategorySettings } from '../../utils/shoppingCategorySettings'

interface FamilySettingsContextValue {
  familyName: string | null
  familyNameLoading: boolean
  familyNameError: string | null
  familyHeroImagePath: string | null
  familyHeroImageUrl: string | null
  shoppingCategorySettings: ShoppingCategorySettings
  updateFamilyName: (name: string) => Promise<void>
  updateFamilyHeroImage: (file: File | null) => Promise<void>
  updateShoppingCategorySettings: (settings: ShoppingCategorySettings) => Promise<void>
  refreshFamilySettings: () => Promise<void>
}

const FamilySettingsContext = createContext<FamilySettingsContextValue | null>(null)

interface ProviderProps {
  familyId: string
  children: ReactNode
}

export function FamilySettingsProvider({ familyId, children }: ProviderProps) {
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
    const { data, error: loadError } = await supabase.from('families').select('name, hero_image_path, shopping_category_settings').eq('id', familyId).single()
    if (activeFamilyIdRef.current !== familyId) return
    if (loadError) {
      console.error('Failed to load family name:', loadError.message)
      setError(t.errors.loadFailed)
      setFamilyNameState({ familyId, name: null, heroImagePath: null, heroImageUrl: null, shoppingCategorySettings: cachedCategorySettings ?? defaultShoppingCategorySettings(), loading: false })
    } else {
      let heroImageUrl: string | null = null
      if (data.hero_image_path) {
        const { data: signedUrl, error: signedUrlError } = await supabase.storage.from('family-hero-images').createSignedUrl(data.hero_image_path, 12 * 60 * 60)
        if (signedUrlError) console.error('Failed to create family hero signed URL:', signedUrlError.message)
        else heroImageUrl = signedUrl.signedUrl
      }
      const nextCategorySettings = normalizeShoppingCategorySettings(data.shopping_category_settings)
      await getShoppingLocalStore().saveCategorySettings(familyId, nextCategorySettings)
      setFamilyNameState({ familyId, name: data.name, heroImagePath: data.hero_image_path, heroImageUrl, shoppingCategorySettings: nextCategorySettings, loading: false })
      setError(null)
    }
  }, [familyId])

  const updateFamilyName = useCallback(async (name: string) => {
    const normalized = name.trim().replace(/\s+/g, ' ')
    if (!normalized) throw new Error(t.errors.generic)
    const { error: updateError } = await supabase.from('families').update({ name: normalized }).eq('id', familyId)
    if (updateError) throw friendly(updateError)
    if (activeFamilyIdRef.current !== familyId) return
    setFamilyNameState((current) => ({ ...current, familyId, name: normalized, loading: false }))
    setError(null)
  }, [familyId])

  const updateShoppingCategorySettings = useCallback(async (settings: ShoppingCategorySettings) => {
    const normalized = normalizeShoppingCategorySettings(settings)
    const { error: updateError } = await supabase.from('families').update({ shopping_category_settings: normalized }).eq('id', familyId)
    if (updateError) throw friendly(updateError)
    await getShoppingLocalStore().saveCategorySettings(familyId, normalized)
    if (activeFamilyIdRef.current !== familyId) return
    setFamilyNameState((current) => ({ ...current, familyId, shoppingCategorySettings: normalized, loading: false }))
  }, [familyId])

  const updateFamilyHeroImage = useCallback(async (file: File | null) => {
    const previousPath = familyNameState.familyId === familyId ? familyNameState.heroImagePath : null
    let uploadedPath: string | null = null
    let nextUrl: string | null = null

    if (file) {
      if (validateFamilyHeroFile(file)) throw new Error(t.errors.generic)
      const extension = file.type === 'image/webp' ? 'webp' : 'jpg'
      uploadedPath = buildFamilyHeroPath(familyId, extension)
      const { error: uploadError } = await supabase.storage.from('family-hero-images').upload(uploadedPath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      })
      if (uploadError) throw friendly(uploadError)
      const { data: signedUrl, error: signedUrlError } = await supabase.storage.from('family-hero-images').createSignedUrl(uploadedPath, 12 * 60 * 60)
      if (signedUrlError) {
        await supabase.storage.from('family-hero-images').remove([uploadedPath])
        throw friendly(signedUrlError)
      }
      nextUrl = signedUrl.signedUrl
    }

    const nextPath = uploadedPath
    const { error: saveError } = await supabase.from('families').update({ hero_image_path: nextPath }).eq('id', familyId)
    if (saveError) {
      if (uploadedPath) await supabase.storage.from('family-hero-images').remove([uploadedPath])
      throw friendly(saveError)
    }
    if (activeFamilyIdRef.current !== familyId) return
    setFamilyNameState((current) => ({ ...current, familyId, heroImagePath: nextPath, heroImageUrl: nextUrl, loading: false }))
    if (previousPath && previousPath !== nextPath) {
      const { error: removeError } = await supabase.storage.from('family-hero-images').remove([previousPath])
      if (removeError) console.error('Failed to remove previous family hero image:', removeError.message)
    }
  }, [familyId, familyNameState])

  useEffect(() => {
    refreshFamilySettings()
  }, [refreshFamilySettings])

  const value: FamilySettingsContextValue = {
    familyName,
    familyNameLoading,
    familyNameError: error,
    familyHeroImagePath,
    familyHeroImageUrl,
    shoppingCategorySettings,
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
