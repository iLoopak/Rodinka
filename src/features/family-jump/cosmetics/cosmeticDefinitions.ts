import type { FamilyJumpCosmeticDefinition } from './cosmeticTypes'

export const FAMILY_JUMP_COSMETICS: readonly FamilyJumpCosmeticDefinition[] = Object.freeze([
  { key: 'round-glasses', name: { cs: 'Kulaté brýle', en: 'Round glasses' }, description: { cs: 'Brýle pro pozorné skokany.', en: 'Glasses for sharp-eyed jumpers.' }, slot: 'face', unlockAtTotalMeters: 10_000, sortOrder: 10 },
  { key: 'bow-tie', name: { cs: 'Motýlek', en: 'Bow tie' }, description: { cs: 'Slavnostní motýlek pod bradu.', en: 'A festive bow tie.' }, slot: 'neck', unlockAtTotalMeters: 30_000, sortOrder: 20 },
  { key: 'jumper-hat', name: { cs: 'Klobouk skokana', en: 'Jumper hat' }, description: { cs: 'Lehký klobouk do velkých výšek.', en: 'A light hat for great heights.' }, slot: 'head', unlockAtTotalMeters: 50_000, sortOrder: 30 },
  { key: 'record-tie', name: { cs: 'Kravata rekordmana', en: 'Record tie' }, description: { cs: 'Kravata pro vytrvalé skokany.', en: 'A tie for persistent jumpers.' }, slot: 'neck', unlockAtTotalMeters: 80_000, sortOrder: 40 },
  { key: 'striped-socks', name: { cs: 'Pruhované ponožky', en: 'Striped socks' }, description: { cs: 'Měkké ponožky na další odraz.', en: 'Soft socks for the next bounce.' }, slot: 'feet', unlockAtTotalMeters: 120_000, sortOrder: 50 },
  { key: 'family-crown', name: { cs: 'Korunka rodinného skokana', en: 'Family jumper crown' }, description: { cs: 'Korunka za společnou porci skákání.', en: 'A crown for a huge jumping journey.' }, slot: 'head', unlockAtTotalMeters: 200_000, sortOrder: 60 },
])

export function cosmeticByKey(key: string) {
  return FAMILY_JUMP_COSMETICS.find((item) => item.key === key)
}

