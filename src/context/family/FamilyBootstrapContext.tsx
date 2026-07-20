import { createContext, useContext, type ReactNode } from 'react'

// Is the family identity currently on screen the confirmed server answer, or
// a cached one still being validated? One boolean, its own context, so the
// header can be honest about it without any other consumer re-rendering.
const FamilyBootstrapContext = createContext(false)

export function FamilyBootstrapProvider({ validating, children }: { validating: boolean; children: ReactNode }) {
  return <FamilyBootstrapContext.Provider value={validating}>{children}</FamilyBootstrapContext.Provider>
}

export function useFamilyIdentityValidating(): boolean {
  return useContext(FamilyBootstrapContext)
}
