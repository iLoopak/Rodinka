import { t } from '../../strings'
import { formatShortDate } from '../../utils/dueDate'
import type { TodayAttentionItem } from '../../utils/todayAgenda'

export function todayAttentionReasonLabel(item: TodayAttentionItem): string {
  const date = item.date ? formatShortDate(item.date) : null
  switch (item.kind) {
    case 'overdue_chore':
      return t.today.attentionChoreReason(date)
    case 'overdue_payment':
      return t.today.attentionPaymentReason(date)
    case 'overdue_medical':
      return t.today.attentionMedicalReason(date)
    case 'meal_vote':
      return t.today.attentionVoteReason
    case 'allowance_due':
      return t.today.attentionAllowanceReason(date ?? t.due.today)
  }
}
