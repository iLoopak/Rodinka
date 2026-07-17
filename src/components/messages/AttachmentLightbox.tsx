import { useEffect } from 'react'
import { t } from '../../strings'

interface Props {
  url: string
  alt: string
  onClose: () => void
}

export function AttachmentLightbox({ url, alt, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('has-attachment-lightbox')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('has-attachment-lightbox')
    }
  }, [onClose])

  return (
    <div className="messages-attachment-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button type="button" className="messages-attachment-lightbox-close" aria-label={t.common.close} onClick={onClose}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>
      <img className="messages-attachment-lightbox-image" src={url} alt={alt} onClick={(e) => e.stopPropagation()} />
    </div>
  )
}
