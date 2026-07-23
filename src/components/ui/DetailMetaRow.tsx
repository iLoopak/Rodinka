import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  children: ReactNode
}

// Shared meta-line row for detail modals (activity series and occurrence
// alike): a small icon plus a line of text, e.g. schedule/location/payment.
export function DetailMetaRow({ icon, children }: Props) {
  return <p className="detail-meta-row">
    <span className="detail-meta-icon" aria-hidden="true">{icon}</span>
    <span>{children}</span>
  </p>
}
