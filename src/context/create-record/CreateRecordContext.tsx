import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { t } from '../../strings'
import type { CreateRecordContext as InitialCreateRecordContext, CreateRecordStatus, RecordType } from './types'

const HISTORY_KEY = 'rodinkaCreateRecord'

interface WizardHistoryEntry {
  token: string
  context: InitialCreateRecordContext
}

export interface CreationSuccessMessage {
  title: string
  body?: string
}

interface WizardState {
  token: string | null
  context: InitialCreateRecordContext | null
  selectedType: RecordType | null
  status: CreateRecordStatus
  error: string | null
  /** Set when `status` is 'success' — what the in-modal success screen shows. */
  success: CreationSuccessMessage | null
}

interface CreateRecordController extends WizardState {
  isOpen: boolean
  currentStep: 1 | 2
  isDirty: boolean
  openCreateRecord: (context?: InitialCreateRecordContext) => void
  closeCreateRecord: (options?: { force?: boolean }) => boolean
  selectRecordType: (type: RecordType) => void
  backToRecordTypes: () => void
  markDirty: () => void
  runCreate: (action: () => Promise<unknown>, success?: CreationSuccessMessage) => Promise<void>
}

const CLOSED_STATE: WizardState = {
  token: null,
  context: null,
  selectedType: null,
  status: 'idle',
  error: null,
  success: null,
}

const CreateRecordControllerContext = createContext<CreateRecordController | null>(null)

function historyEntry(state: unknown): WizardHistoryEntry | null {
  if (!state || typeof state !== 'object') return null
  const candidate = (state as Record<string, unknown>)[HISTORY_KEY]
  if (!candidate || typeof candidate !== 'object') return null
  const token = (candidate as Record<string, unknown>).token
  const context = (candidate as Record<string, unknown>).context
  if (typeof token !== 'string' || !context || typeof context !== 'object') return null
  return { token, context: context as InitialCreateRecordContext }
}

function initialState(): WizardState {
  if (typeof window === 'undefined') return CLOSED_STATE
  const entry = historyEntry(window.history.state)
  if (!entry) return CLOSED_STATE
  return {
    token: entry.token,
    context: entry.context,
    selectedType: entry.context.type ?? null,
    status: 'idle',
    error: null,
    success: null,
  }
}

function nextToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `create-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function CreateRecordProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState)
  const [isDirty, setIsDirty] = useState(false)
  const stateRef = useRef(state)
  const dirtyRef = useRef(isDirty)
  const submittingRef = useRef(false)
  const allowNextPopRef = useRef(false)
  stateRef.current = state
  dirtyRef.current = isDirty

  const reset = useCallback(() => {
    submittingRef.current = false
    setIsDirty(false)
    setState(CLOSED_STATE)
  }, [])

  const confirmDiscard = useCallback(() => {
    return !dirtyRef.current || window.confirm(t.create.discardChanges)
  }, [])

  const replaceWizardHistory = useCallback((token: string, context: InitialCreateRecordContext) => {
    if (typeof window === 'undefined') return
    window.history.replaceState(
      { ...window.history.state, [HISTORY_KEY]: { token, context } satisfies WizardHistoryEntry },
      '',
      window.location.href,
    )
  }, [])

  const openCreateRecord = useCallback((context: InitialCreateRecordContext = {}) => {
    if (typeof window === 'undefined') return
    const current = stateRef.current
    if (current.context && !confirmDiscard()) return

    const token = current.token ?? nextToken()
    const next: WizardState = {
      token,
      context,
      selectedType: context.type ?? null,
      status: 'idle',
      error: null,
      success: null,
    }
    setIsDirty(false)
    setState(next)

    const nextHistory = {
      ...window.history.state,
      [HISTORY_KEY]: { token, context } satisfies WizardHistoryEntry,
    }
    if (current.token) window.history.replaceState(nextHistory, '', window.location.href)
    else window.history.pushState(nextHistory, '', window.location.href)
  }, [confirmDiscard])

  const closeCreateRecord = useCallback((options?: { force?: boolean }) => {
    if (typeof window === 'undefined') return false
    if (allowNextPopRef.current) return false
    if (!options?.force && stateRef.current.status === 'submitting') return false
    if (!options?.force && !confirmDiscard()) return false

    const current = stateRef.current
    setIsDirty(false)
    if (current.token && historyEntry(window.history.state)?.token === current.token) {
      allowNextPopRef.current = true
      window.history.back()
    } else {
      reset()
    }
    return true
  }, [confirmDiscard, reset])

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const entry = historyEntry(event.state)
      const current = stateRef.current

      if (entry) {
        allowNextPopRef.current = false
        setIsDirty(false)
        setState({
          token: entry.token,
          context: entry.context,
          selectedType: entry.context.type ?? null,
          status: 'idle',
          error: null,
          success: null,
        })
        return
      }

      if (!current.token) return
      if (current.status === 'submitting') {
        window.history.forward()
        return
      }
      if (!allowNextPopRef.current && dirtyRef.current && !window.confirm(t.create.discardChanges)) {
        window.history.forward()
        return
      }
      allowNextPopRef.current = false
      reset()
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [reset])

  const selectRecordType = useCallback((type: RecordType) => {
    const current = stateRef.current
    if (!current.context || !current.token) return
    const context = { ...current.context, type }
    setIsDirty(false)
    setState({ ...current, context, selectedType: type, status: 'idle', error: null, success: null })
    replaceWizardHistory(current.token, context)
  }, [replaceWizardHistory])

  const backToRecordTypes = useCallback(() => {
    const current = stateRef.current
    if (!current.context || !current.token || !current.selectedType) return
    if (!confirmDiscard()) return
    const { type: _type, ...context } = current.context
    setIsDirty(false)
    setState({ ...current, context, selectedType: null, status: 'idle', error: null, success: null })
    replaceWizardHistory(current.token, context)
  }, [confirmDiscard, replaceWizardHistory])

  const markDirty = useCallback(() => {
    if (submittingRef.current) return
    setIsDirty(true)
  }, [])

  const runCreate = useCallback(async (action: () => Promise<unknown>, success?: CreationSuccessMessage) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setState((current) => ({ ...current, status: 'submitting', error: null }))
    try {
      await action()
      dirtyRef.current = false
      setIsDirty(false)
      // Stays open on a success screen instead of closing immediately — the
      // caller (the wizard) renders it and closes via `closeCreateRecord`
      // once the user confirms. No toast.
      setState((current) => ({ ...current, status: 'success', success: success ?? { title: t.create.success } }))
    } catch (error) {
      setState((current) => ({ ...current, status: 'error', error: t.errors.generic }))
      throw error
    } finally {
      submittingRef.current = false
    }
  }, [])

  const value = useMemo<CreateRecordController>(() => ({
    ...state,
    isOpen: state.context !== null,
    currentStep: state.selectedType ? 2 : 1,
    isDirty,
    openCreateRecord,
    closeCreateRecord,
    selectRecordType,
    backToRecordTypes,
    markDirty,
    runCreate,
  }), [state, isDirty, openCreateRecord, closeCreateRecord, selectRecordType, backToRecordTypes, markDirty, runCreate])

  return (
    <CreateRecordControllerContext.Provider value={value}>
      {children}
    </CreateRecordControllerContext.Provider>
  )
}

export function useCreateRecord() {
  const context = useContext(CreateRecordControllerContext)
  if (!context) throw new Error('useCreateRecord must be used within a CreateRecordProvider')
  return context
}

export function useOptionalCreateRecord() {
  return useContext(CreateRecordControllerContext)
}

export type { InitialCreateRecordContext as CreateRecordContext, RecordType }
