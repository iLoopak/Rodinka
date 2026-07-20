import { supabase } from '../../../supabaseClient'
import { toFamilyError, type FamilyOperation } from '../domain/familyErrors'
import type { FamilyOnboardingRepository } from './familyRepository'

/**
 * Deliberately its own module. The onboarding screen is on the eager startup
 * path, and importing it from the main family repository dragged the realtime
 * subscription helper and every mapper into the initial bundle — which the
 * route-chunk budget caught.
 */
async function run(operation: FamilyOperation, work: () => PromiseLike<{ error: unknown }>): Promise<void> {
  let result: { error: unknown }
  try {
    result = await work()
  } catch (error) {
    throw toFamilyError(operation, error)
  }
  if (result.error) throw toFamilyError(operation, result.error)
}

export class SupabaseFamilyOnboardingRepository implements FamilyOnboardingRepository {
  async createFamily(input: { familyName: string; displayName: string }) {
    await run('family.createFamily', () => supabase.rpc('create_family', {
      family_name: input.familyName, admin_display_name: input.displayName,
    }))
  }

  async redeemInvite(input: { code: string; displayName: string }) {
    // The code is normalised here so no caller can forget to.
    await run('family.redeemInvite', () => supabase.rpc('redeem_invite', {
      invite_code: input.code.trim().toUpperCase(), display_name: input.displayName,
    }))
  }
}
