import type { QueryHistoryMode } from '../../utils/deepLinks'

type SetQueryParam = (name: string, value: string, mode?: QueryHistoryMode) => void
type RemoveQueryParam = (name: string, mode?: QueryHistoryMode) => void

export function openTodayChoreEditor(taskId: string, setQueryParam: SetQueryParam) {
  setQueryParam('chore', taskId)
  setQueryParam('edit', '1', 'replace')
}

export function closeTodayChoreEditor(removeQueryParam: RemoveQueryParam) {
  removeQueryParam('edit', 'replace')
  removeQueryParam('chore', 'replace')
}
