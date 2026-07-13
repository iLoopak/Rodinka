interface Props {
  size?: number
}

// The mark: four soft, slightly irregular pieces (family members) arranged
// around a shared center, leaving a small rounded negative space in the
// middle. See visual-identity.md for the full rationale.
export function Logo({ size = 32 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect
        x="22"
        y="8"
        width="20"
        height="20"
        rx="7"
        fill="#B94742"
        transform="rotate(39 32 18)"
      />
      <rect
        x="36"
        y="22"
        width="20"
        height="20"
        rx="7"
        fill="#E96C62"
        transform="rotate(51 46 32)"
      />
      <rect
        x="22"
        y="36"
        width="20"
        height="20"
        rx="7"
        fill="#97302B"
        transform="rotate(39 32 46)"
      />
      <rect
        x="8"
        y="22"
        width="20"
        height="20"
        rx="7"
        fill="#F2A99F"
        transform="rotate(51 18 32)"
      />
    </svg>
  )
}
