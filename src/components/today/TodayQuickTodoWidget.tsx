import { useEffect, useRef, useState } from 'react'
import { t } from '../../strings'
import type { Chore } from '../../utils/choreModel'
import { CompletionCheckbox } from '../ui/CompletionCheckbox'
import { TodayQuickAddField } from './TodayQuickAddField'

const PREVIEW_LIMIT = 5

interface Props {
  tasks: Chore[]
  onAdd: (title: string) => Promise<void>
  onComplete: (taskId: string) => Promise<void>
  onPromote: (taskId: string) => void
  onOpenAll: () => void
}

export function TodayQuickTodoWidget({ tasks, onAdd, onComplete, onPromote, onOpenAll }: Props) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)
  const [pendingTask, setPendingTask] = useState<Chore | null>(null)
  const [expanded, setExpanded] = useState(false)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const visibleTasks = pendingTask ? tasks.filter((task) => task.id !== pendingTask.id) : tasks
  const preview = expanded ? visibleTasks : visibleTasks.slice(0, PREVIEW_LIMIT)
  const remaining = visibleTasks.length - PREVIEW_LIMIT

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle || busy) return
    setBusy('add')
    setFeedback(null)
    setHasError(false)
    try {
      await onAdd(nextTitle)
      setTitle('')
      setFeedback(t.today.quickTaskAdded)
    } catch (error) {
      console.error('Failed to add a quick task from Today:', error)
      setHasError(true)
      setFeedback(t.errors.generic)
    } finally {
      setBusy(null)
    }
  }

  async function persistCompletion(task: Chore) {
    completionTimerRef.current = null
    if (mountedRef.current) {
      setBusy(task.id)
      setFeedback(null)
      setHasError(false)
    }
    try {
      await onComplete(task.id)
      if (mountedRef.current) setFeedback(t.today.quickTaskCompleted)
    } catch (error) {
      console.error('Failed to complete a quick task from Today:', error)
      if (mountedRef.current) {
        setHasError(true)
        setFeedback(t.errors.generic)
      }
    } finally {
      if (mountedRef.current) {
        setPendingTask(null)
        setBusy(null)
      }
    }
  }

  function complete(task: Chore) {
    if (busy || pendingTask) return
    setFeedback(null)
    setHasError(false)
    setPendingTask(task)
    completionTimerRef.current = setTimeout(() => persistCompletion(task), 5000)
  }

  function undoCompletion() {
    if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    completionTimerRef.current = null
    setPendingTask(null)
    setFeedback(null)
  }

  return (
    <section className="today-section today-quick-todo-widget" aria-labelledby="today-quick-todo-title">
      <div className="today-section-head">
        <span className="today-quick-todo-heading">
          <h2 id="today-quick-todo-title" className="today-section-title">{t.today.quickTasksTitle}</h2>
          <span className="today-section-count">{t.today.quickTasksCount(visibleTasks.length)}</span>
        </span>
        <button type="button" className="link today-quick-todo-open" onClick={onOpenAll}>
          {t.today.quickTasksOpenAction}<span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="today-panel is-secondary is-tasks">
      <TodayQuickAddField
        value={title}
        placeholder={t.today.quickTaskPlaceholder}
        accessibleLabel={t.today.quickTaskLabel}
        submitLabel={t.shopping.quickAddAction}
        busy={busy === 'add'}
        onChange={setTitle}
        onSubmit={submit}
      />

      {preview.length > 0 ? (
        <ul className="today-quick-todo-list" data-preview-count={preview.length}>
          {preview.map((task) => <li key={task.id}>
            <CompletionCheckbox
              checked={false}
              label={t.today.quickTaskComplete(task.title)}
              disabled={busy !== null}
              onClick={() => complete(task)}
            />
            <span className="today-quick-todo-title">{task.title}</span>
            <button type="button" className="link today-quick-todo-promote" disabled={busy !== null} onClick={() => onPromote(task.id)}>
              {t.today.quickTaskPromote}
            </button>
          </li>)}
        </ul>
      ) : !pendingTask ? (
        <p className="today-quick-todo-empty">{t.today.quickTasksEmpty}</p>
      ) : null}
      {remaining > 0 && <button type="button" className="link today-quick-todo-more" onClick={() => setExpanded((current) => !current)}>
        {expanded ? t.today.quickTasksShowLess : t.today.quickTasksMore(remaining)}
      </button>}
      {pendingTask && (
        <div className="today-quick-todo-undo" role="status">
          <span>{t.today.quickTaskMarkedDone(pendingTask.title)}</span>
          <button type="button" className="link" onClick={undoCompletion}>{t.today.quickTaskUndo}</button>
        </div>
      )}
      {feedback && <p className={`today-quick-add-feedback${hasError ? ' error' : ''}`} role={hasError ? 'alert' : 'status'}>{feedback}</p>}
      </div>
    </section>
  )
}
