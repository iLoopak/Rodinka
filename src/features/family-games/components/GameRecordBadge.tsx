export interface GameRecordBadgeProps {
  label: string
  /** Already-formatted value (e.g. "7485 m" or "12,430"), or null for no record yet. */
  value: string | null
  noRecordLabel: string
}

// One stacked "label / value" format everywhere a personal record shows up,
// instead of each game inventing its own inline phrasing.
export function GameRecordBadge({ label, value, noRecordLabel }: GameRecordBadgeProps) {
  return <span className="game-record-badge">
    {value ? <>
      <span className="game-record-badge-label">{label}</span>
      <strong className="game-record-badge-value">{value}</strong>
    </> : <span className="game-record-badge-empty">{noRecordLabel}</span>}
  </span>
}
