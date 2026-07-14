import { useState } from 'react'
import { t } from '../strings'
import type { FamilyMember } from '../hooks/useFamilyMembers'
import { MemberAvatar } from './ui/MemberAvatar'

interface Props {
  kids: FamilyMember[]
  balances: Map<string, number>
  onPayout: (memberId: string, amount: number, reason: string) => Promise<void>
}

export function AllowanceBalances({ kids, balances, onPayout }: Props) {
  const [payoutFor, setPayoutFor] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function openPayout(memberId: string) {
    setPayoutFor(memberId)
    setAmount('')
    setReason('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent, memberId: string) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await onPayout(memberId, Number(amount) || 0, reason)
      setPayoutFor(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (kids.length === 0) {
    return <p className="empty-state">{t.chores.noMembers}</p>
  }

  return (
    <ul className="section-list">
      {kids.map((kid) => (
        <li key={kid.id}>
          <MemberAvatar member={kid} />
          <span className="row-title">{kid.display_name}</span>
          <span className="row-spacer" />
          <span className="row-amount">{t.chores.formatAmount(balances.get(kid.id) ?? 0)}</span>
          <button className="btn-secondary" onClick={() => openPayout(kid.id)}>
            {t.chores.payoutButton}
          </button>
          {payoutFor === kid.id && (
            <form onSubmit={(e) => handleSubmit(e, kid.id)}>
              <h4>{t.chores.payoutTitle}</h4>
              <label>
                {t.chores.payoutAmountLabel}
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                {t.chores.payoutReasonLabel}
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button type="submit" disabled={loading}>
                {loading ? t.chores.payingOut : t.chores.payoutSubmit}
              </button>
              <button type="button" className="link" onClick={() => setPayoutFor(null)}>
                {t.chores.cancel}
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          )}
        </li>
      ))}
    </ul>
  )
}
