import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../../strings'
import {
  MEMBER_AVATAR_MAX_ZOOM,
  avatarCropGeometry,
  clampAvatarCropTransform,
  createCroppedMemberAvatar,
  initialAvatarCropTransform,
  loadMemberAvatarImage,
  type AvatarCropTransform,
  type LoadedMemberAvatarImage,
} from '../../utils/memberAvatarImage'

interface Props {
  file: File
  onSave: (file: File) => Promise<void>
  onCancel: () => void
  onError: () => void
}

interface Gesture {
  transform: AvatarCropTransform
  centerX: number
  centerY: number
  distance: number
}

export function AvatarCropEditor({ file, onSave, onCancel, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const imageRef = useRef<LoadedMemberAvatarImage | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<Gesture | null>(null)
  const [viewportSize, setViewportSize] = useState(320)
  const [transform, setTransform] = useState(initialAvatarCropTransform)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [decodeFailed, setDecodeFailed] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onCancel])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const updateSize = () => setViewportSize(Math.max(1, viewport.clientWidth))
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setDecodeFailed(false)
    void loadMemberAvatarImage(file).then((image) => {
      if (!active) {
        image.cleanup()
        return
      }
      imageRef.current = image
      setTransform(initialAvatarCropTransform())
      setLoading(false)
    }).catch((error) => {
      console.error('Failed to decode avatar source:', error)
      if (active) {
        setLoading(false)
        setDecodeFailed(true)
        onError()
      }
    })
    return () => {
      active = false
      imageRef.current?.cleanup()
      imageRef.current = null
    }
  }, [file, onError])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || loading) return
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(viewportSize * pixelRatio)
    canvas.height = Math.round(viewportSize * pixelRatio)
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, viewportSize, viewportSize)
    const geometry = avatarCropGeometry(image.width, image.height, viewportSize, transform)
    context.drawImage(image.source, geometry.x, geometry.y, geometry.renderedWidth, geometry.renderedHeight)
  }, [loading, transform, viewportSize])

  const updateTransform = useCallback((next: AvatarCropTransform) => {
    const image = imageRef.current
    if (!image) return
    setTransform(clampAvatarCropTransform(image.width, image.height, viewportSize, next))
  }, [viewportSize])

  function beginGesture() {
    const points = [...pointersRef.current.values()]
    if (points.length === 0) {
      gestureRef.current = null
      return
    }
    const first = points[0]
    const second = points[1]
    gestureRef.current = {
      transform,
      centerX: second ? (first.x + second.x) / 2 : first.x,
      centerY: second ? (first.y + second.y) / 2 : first.y,
      distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    beginGesture()
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointersRef.current.has(event.pointerId) || !gestureRef.current) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointersRef.current.values()]
    const first = points[0]
    const second = points[1]
    const centerX = second ? (first.x + second.x) / 2 : first.x
    const centerY = second ? (first.y + second.y) / 2 : first.y
    const distance = second ? Math.hypot(second.x - first.x, second.y - first.y) : 0
    const zoom = second && gestureRef.current.distance > 0
      ? gestureRef.current.transform.zoom * (distance / gestureRef.current.distance)
      : gestureRef.current.transform.zoom
    updateTransform({
      zoom,
      offsetX: gestureRef.current.transform.offsetX + centerX - gestureRef.current.centerX,
      offsetY: gestureRef.current.transform.offsetY + centerY - gestureRef.current.centerY,
    })
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId)
    beginGesture()
  }

  async function applyCrop() {
    const image = imageRef.current
    if (!image) return
    setProcessing(true)
    setSaveError(null)
    try {
      const cropped = await createCroppedMemberAvatar(image, viewportSize, transform)
      await onSave(cropped)
      // On success the caller closes this dialog (it owns that state) — don't
      // touch local state further so we don't set-state-after-unmount.
    } catch (error) {
      console.error('Failed to save avatar:', error)
      setSaveError(t.family.errors.avatarUploadFailed)
      setProcessing(false)
    }
  }

  return (
    <div className="avatar-crop-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section ref={dialogRef} className="avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
        <header className="avatar-crop-header">
          <h3 id="avatar-crop-title">{t.family.cropTitle}</h3>
          <p>{t.family.cropHelp}</p>
        </header>

        <div className="avatar-crop-viewport" ref={viewportRef}>
          <canvas
            ref={canvasRef}
            className="avatar-crop-canvas"
            role="img"
            aria-label={t.family.cropPreviewLabel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onWheel={(event) => {
              event.preventDefault()
              updateTransform({ ...transform, zoom: transform.zoom + (event.deltaY < 0 ? 0.1 : -0.1) })
            }}
          />
          <span className="avatar-crop-mask" aria-hidden="true" />
          {loading && <span className="avatar-crop-status">{t.family.cropLoading}</span>}
          {decodeFailed && <span className="avatar-crop-status error" role="alert">{t.family.errors.avatarCorrupt}</span>}
        </div>

        <label className="avatar-crop-zoom">
          <span>{t.family.cropZoom}</span>
          <input
            type="range"
            min="1"
            max={MEMBER_AVATAR_MAX_ZOOM}
            step="0.01"
            value={transform.zoom}
            disabled={loading || decodeFailed || processing}
            onChange={(event) => updateTransform({ ...transform, zoom: Number(event.target.value) })}
          />
          <output>{Math.round(transform.zoom * 100)}%</output>
        </label>

        {saveError && <p className="error avatar-crop-error" role="alert">{saveError}</p>}

        <footer className="avatar-crop-actions">
          <div className="avatar-crop-actions-secondary">
            <button ref={cancelRef} type="button" className="btn-secondary" onClick={onCancel} disabled={processing}>
              {t.family.cropCancel}
            </button>
            <button type="button" className="btn-secondary" onClick={() => updateTransform(initialAvatarCropTransform())} disabled={loading || decodeFailed || processing}>
              {t.family.cropReset}
            </button>
          </div>
          <button type="button" onClick={applyCrop} disabled={loading || decodeFailed || processing}>
            {processing ? t.family.cropApplying : t.family.cropApply}
          </button>
        </footer>
      </section>
    </div>
  )
}
