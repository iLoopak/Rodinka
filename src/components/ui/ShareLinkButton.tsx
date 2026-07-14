import { useState } from 'react'
import type { Route } from '../../router'
import { t } from '../../strings'
import { buildDeepLink, shareDeepLink } from '../../utils/deepLinks'

interface Props {
  route: Route
  param: 'event' | 'chore' | 'activity' | 'record'
  id: string
  title: string
}

export function ShareLinkButton({ route, param, id, title }: Props) {
  const [status, setStatus] = useState<string | null>(null)

  async function handleShare() {
    setStatus(null)
    try {
      const result = await shareDeepLink(buildDeepLink(window.location.origin, route, param, id), title)
      if (result === 'copied') setStatus(t.deepLinks.linkCopied)
      if (result === 'shared') setStatus(t.deepLinks.linkShared)
    } catch (error) {
      console.error('Failed to share deep link:', error)
      setStatus(t.deepLinks.shareFailed)
    }
  }

  return (
    <div className="share-link-action">
      <button type="button" className="btn-secondary" onClick={handleShare}>
        {t.deepLinks.shareLink}
      </button>
      <span className="share-link-feedback" aria-live="polite">{status}</span>
    </div>
  )
}
