import { lazy, Suspense } from 'react'
import { useCreateRecord } from '../../context/create-record/CreateRecordContext'
import { t } from '../../strings'
import { FamilyMark } from '../FamilyMark'
import { Modal } from '../ui/Modal'

const LazyCreateRecordWizard = lazy(() => import('./CreateRecordWizard').then(({ CreateRecordWizard }) => {
  if (import.meta.env.DEV) {
    void import('../../startup/startupDiagnostics').then(({ recordLazyStartupModule }) => {
      recordLazyStartupModule('create-record-wizard')
    })
  }
  return { default: CreateRecordWizard }
}))

export function CreateRecordWizardController() {
  const create = useCreateRecord()
  if (!create.isOpen) return null

  return (
    <Suspense fallback={<CreateRecordLoadingFallback onClose={() => { create.closeCreateRecord() }} />}>
      <LazyCreateRecordWizard />
    </Suspense>
  )
}

function CreateRecordLoadingFallback({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={t.create.title} onClose={onClose} closeOnBackdrop={false} className="create-record-wizard">
      <div className="create-record-loading" role="status" aria-live="polite" aria-busy="true">
        <FamilyMark variant="static" size={32} />
        <span>{t.loading.generic}</span>
      </div>
    </Modal>
  )
}
