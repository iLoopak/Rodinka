import type { MessageReactionRow } from '../../context/messages/types'

interface Props {
  reactions: MessageReactionRow[]
  currentMemberId: string
  onToggle: (emoji: string) => void | Promise<void>
  memberName: (id: string) => string
}

// Compact chip row shown under a message. Groups reactions by emoji so
// two ❤️ from different members render as "❤️ 2". Clicking a chip
// toggles the current member's reaction; the underlying RPC is
// idempotent.
export function ReactionsRow({ reactions, currentMemberId, onToggle, memberName }: Props) {
  if (reactions.length === 0) return null
  const grouped = new Map<string, { count: number; mine: boolean; members: string[] }>()
  for (const reaction of reactions) {
    const entry = grouped.get(reaction.emoji) ?? { count: 0, mine: false, members: [] }
    entry.count += 1
    if (reaction.member_id === currentMemberId) entry.mine = true
    entry.members.push(reaction.member_id)
    grouped.set(reaction.emoji, entry)
  }
  return (
    <ul className="messages-reactions-row">
      {[...grouped.entries()].map(([emoji, info]) => (
        <li key={emoji}>
          <button
            type="button"
            className={`messages-reaction-chip${info.mine ? ' is-mine' : ''}`}
            onClick={() => void onToggle(emoji)}
            title={info.members.map(memberName).join(', ')}
          >
            <span aria-hidden="true">{emoji}</span>
            <span className="messages-reaction-count">{info.count}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
