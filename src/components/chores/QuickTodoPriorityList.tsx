import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import { t } from '../../strings'
import type { Chore } from '../../utils/choreModel'
import { CompletionCheckbox } from '../ui/CompletionCheckbox'

interface Props {
  tasks: Chore[]
  onComplete: (taskId: string) => Promise<void>
  onPromote: (task: Chore) => void
  onReorder: (orderedIds: string[]) => Promise<void>
}

export function QuickTodoPriorityList({ tasks, onComplete, onPromote, onReorder }: Props) {
  const taskIdsKey = tasks.map((task) => task.id).join('|')
  const [orderedIds, setOrderedIds] = useState(() => tasks.map((task) => task.id))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => setOrderedIds(taskIdsKey ? taskIdsKey.split('|') : []), [taskIdsKey])

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const orderedTasks = orderedIds.map((id) => taskById.get(id)).filter((task): task is Chore => Boolean(task))
  const activeTask = activeId ? taskById.get(activeId) : undefined

  async function saveOrder(nextIds: string[], previousIds: string[]) {
    setBusyId('reorder')
    setError(null)
    try {
      await onReorder(nextIds)
    } catch (reason) {
      setOrderedIds(previousIds)
      setError(reason instanceof Error ? reason.message : t.errors.generic)
    } finally {
      setBusyId(null)
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    if (!event.over || event.active.id === event.over.id) return
    const oldIndex = orderedIds.indexOf(String(event.active.id))
    const newIndex = orderedIds.indexOf(String(event.over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const previousIds = orderedIds
    const nextIds = arrayMove(orderedIds, oldIndex, newIndex)
    setOrderedIds(nextIds)
    void saveOrder(nextIds, previousIds)
  }

  async function complete(taskId: string) {
    setBusyId(taskId)
    setError(null)
    try {
      await onComplete(taskId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.errors.generic)
    } finally {
      setBusyId(null)
    }
  }

  return <>
    {error && <p className="error" role="alert">{error}</p>}
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <ul className="quick-todo-priority-list">
          {orderedTasks.map((task) => <SortableQuickTodo
            key={task.id}
            task={task}
            busy={busyId !== null}
            onComplete={() => complete(task.id)}
            onPromote={() => onPromote(task)}
          />)}
        </ul>
      </SortableContext>
      <DragOverlay modifiers={[snapCenterToCursor]}>
        {activeTask && <div className="list-drag-preview quick-todo-drag-overlay">
          <span className="list-drag-preview-handle" aria-hidden="true">⠿</span>
          <span className="list-drag-preview-copy"><strong>{activeTask.title}</strong><small>{t.chores.quickTasksTitle}</small></span>
        </div>}
      </DragOverlay>
    </DndContext>
  </>
}

function SortableQuickTodo({ task, busy, onComplete, onPromote }: {
  task: Chore
  busy: boolean
  onComplete: () => void
  onPromote: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: busy })
  return <li
    ref={setNodeRef}
    data-priority-task-id={task.id}
    className={isDragging ? 'dragging' : ''}
    style={{ transform: isDragging ? undefined : CSS.Transform.toString(transform), transition }}
  >
    <button
      type="button"
      className="list-drag-handle"
      aria-label={t.today.quickTaskDrag(task.title)}
      disabled={busy}
      {...attributes}
      {...listeners}
    ><span aria-hidden="true">⠿</span></button>
    <CompletionCheckbox checked={false} label={t.today.quickTaskComplete(task.title)} disabled={busy} onClick={onComplete} />
    <span className="quick-todo-priority-title">{task.title}</span>
    <button type="button" className="link quick-todo-priority-promote" disabled={busy} onClick={onPromote}>
      {t.today.quickTaskPromote}
    </button>
  </li>
}
