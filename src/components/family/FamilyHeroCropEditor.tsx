import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../../strings'
import { MEMBER_AVATAR_MAX_ZOOM, initialAvatarCropTransform, loadMemberAvatarImage, type AvatarCropTransform, type LoadedMemberAvatarImage } from '../../utils/memberAvatarImage'
import { clampFamilyHeroCropTransform, createCroppedFamilyHero, familyHeroCropGeometry } from '../../utils/familyHeroImage'

interface Props {
  file: File
  onApply: (file: File) => void
  onCancel: () => void
  onError: () => void
}

interface Gesture {
  transform: AvatarCropTransform
  centerX: number
  centerY: number
  distance: number
}

export function FamilyHeroCropEditor({ file, onApply, onCancel, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const imageRef = useRef<LoadedMemberAvatarImage | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<Gesture | null>(null)
  const [viewport, setViewport] = useState({ width: 480, height: 210 })
  const [transform, setTransform] = useState(initialAvatarCropTransform)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [decodeFailed, setDecodeFailed] = useState(false)

  useEffect(() => {
    cancelRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
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
    const element = viewportRef.current
    if (!element) return
    const update = () => setViewport({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    void loadMemberAvatarImage(file).then((image) => {
      if (!active) return image.cleanup()
      imageRef.current = image
      setTransform(initialAvatarCropTransform())
      setLoading(false)
    }).catch((error) => {
      console.error('Failed to decode family hero image:', error)
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
    canvas.width = Math.round(viewport.width * pixelRatio)
    canvas.height = Math.round(viewport.height * pixelRatio)
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)
    const geometry = familyHeroCropGeometry(image.width, image.height, viewport.width, viewport.height, transform)
    context.drawImage(image.source, geometry.x, geometry.y, geometry.renderedWidth, geometry.renderedHeight)
  }, [loading, transform, viewport])

  const updateTransform = useCallback((next: AvatarCropTransform) => {
    const image = imageRef.current
    if (!image) return
    setTransform(clampFamilyHeroCropTransform(image.width, image.height, viewport.width, viewport.height, next))
  }, [viewport])

  function beginGesture() {
    const points = [...pointersRef.current.values()]
    if (points.length === 0) return void (gestureRef.current = null)
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
      ? gestureRef.current.transform.zoom * distance / gestureRef.current.distance
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
    try {
      onApply(await createCroppedFamilyHero(image, viewport.width, viewport.height, transform))
    } catch (error) {
      console.error('Failed to crop family hero image:', error)
      onError()
      setProcessing(false)
    }
  }

  return <div className="avatar-crop-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <section ref={dialogRef} className="avatar-crop-dialog family-hero-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="family-hero-crop-title">
      <header className="avatar-crop-header">
        <h3 id="family-hero-crop-title">{t.more.familyPhotoCropTitle}</h3>
        <p>{t.more.familyPhotoCropHelp}</p>
      </header>
      <div className="avatar-crop-viewport family-hero-crop-viewport" ref={viewportRef}>
        <canvas
          ref={canvasRef}
          className="avatar-crop-canvas"
          role="img"
          aria-label={t.more.familyPhotoCropPreview}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={(event) => {
            event.preventDefault()
            updateTransform({ ...transform, zoom: transform.zoom + (event.deltaY < 0 ? 0.1 : -0.1) })
          }}
        />
        <span className="family-hero-crop-frame" aria-hidden="true" />
        {loading && <span className="avatar-crop-status">{t.family.cropLoading}</span>}
        {decodeFailed && <span className="avatar-crop-status error" role="alert">{t.family.errors.avatarCorrupt}</span>}
      </div>
      <label className="avatar-crop-zoom">
        <span>{t.family.cropZoom}</span>
        <input type="range" min="1" max={MEMBER_AVATAR_MAX_ZOOM} step="0.01" value={transform.zoom} disabled={loading || decodeFailed || processing} onChange={(event) => updateTransform({ ...transform, zoom: Number(event.target.value) })} />
        <output>{Math.round(transform.zoom * 100)}%</output>
      </label>
      <footer className="avatar-crop-actions">
        <button ref={cancelRef} type="button" className="btn-secondary" onClick={onCancel} disabled={processing}>{t.family.cropCancel}</button>
        <button type="button" className="btn-secondary" onClick={() => updateTransform(initialAvatarCropTransform())} disabled={loading || decodeFailed || processing}>{t.family.cropReset}</button>
        <button type="button" onClick={applyCrop} disabled={loading || decodeFailed || processing}>{processing ? t.family.cropApplying : t.family.cropApply}</button>
      </footer>
    </section>
  </div>
}
