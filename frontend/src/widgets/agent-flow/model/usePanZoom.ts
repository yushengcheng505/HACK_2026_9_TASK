import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent, RefObject } from 'react'

export interface View2D {
  x: number
  y: number
  k: number
}

export const ZOOM = { min: 0.35, max: 2.5 } as const
const DRAG_THRESHOLD = 4
const clampK = (k: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, k))

/**
 * Панорама и зум холста. Колесо мыши и pinch трекпада приближают к курсору, прокрутка двумя пальцами
 * и перетаскивание — двигают. Пока пользователь не трогал холст, мир вписывается в окно при каждом ресайзе.
 */
export function usePanZoom(viewport: RefObject<HTMLDivElement | null>, world: { w: number; h: number }, size: { w: number; h: number }) {
  const [view, setView] = useState<View2D>({ x: 0, y: 0, k: 1 })
  const [smooth, setSmooth] = useState(false)
  const [dragging, setDragging] = useState(false)
  const touched = useRef(false)
  /** Последний жест был перетаскиванием — следующий click по узлу не считается выбором. */
  const suppressClick = useRef(false)

  const fitView = useCallback((): View2D => {
    if (!size.w || !size.h || !world.w || !world.h) return { x: 0, y: 0, k: 1 }
    const k = clampK(Math.min(size.w / world.w, size.h / world.h, 1))
    return { x: (size.w - world.w * k) / 2, y: (size.h - world.h * k) / 2, k }
  }, [size.w, size.h, world.w, world.h])

  useEffect(() => {
    if (!touched.current) {
      setSmooth(false)
      setView(fitView())
    }
  }, [fitView])

  const zoomAt = useCallback((factor: number, cx: number, cy: number, animate: boolean) => {
    touched.current = true
    setSmooth(animate)
    setView((v) => {
      const k = clampK(v.k * factor)
      const r = k / v.k
      return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }
    })
  }, [])

  const zoomBy = useCallback((factor: number) => zoomAt(factor, size.w / 2, size.h / 2, true), [zoomAt, size.w, size.h])

  const fit = useCallback(() => {
    touched.current = false
    setSmooth(true)
    setView(fitView())
  }, [fitView])

  const panBy = useCallback((dx: number, dy: number, animate = false) => {
    touched.current = true
    setSmooth(animate)
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }, [])

  /** Показать точку мира в центре окна (например, выбранного агента). */
  const centerOn = useCallback(
    (wx: number, wy: number) => {
      touched.current = true
      setSmooth(true)
      setView((v) => ({ ...v, x: size.w / 2 - wx * v.k, y: size.h / 2 - wy * v.k }))
    },
    [size.w, size.h],
  )

  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const pinch = e.ctrlKey || e.metaKey
      const trackpadPan = !pinch && (e.shiftKey || Math.abs(e.deltaX) > 0.5)
      if (trackpadPan) {
        panBy(-(e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), e.shiftKey ? 0 : -e.deltaY)
        return
      }
      const unit = e.deltaMode === 1 ? 33 : 1
      zoomAt(Math.exp(-e.deltaY * unit * (pinch ? 0.01 : 0.0016)), e.clientX - rect.left, e.clientY - rect.top, false)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewport, zoomAt, panBy])

  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    suppressClick.current = false
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      d.moved = true
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    d.x = e.clientX
    d.y = e.clientY
    panBy(dx, dy)
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    suppressClick.current = d.moved
    drag.current = null
    setDragging(false)
  }
  /** Ловим click в фазе погружения: после перетаскивания он не должен выбрать узел. */
  const onClickCapture = (e: MouseEvent) => {
    if (suppressClick.current) {
      e.stopPropagation()
      e.preventDefault()
      suppressClick.current = false
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const step = 80
    const keys: Record<string, () => void> = {
      '+': () => zoomBy(1.25),
      '=': () => zoomBy(1.25),
      '-': () => zoomBy(0.8),
      '0': fit,
      ArrowLeft: () => panBy(step, 0, true),
      ArrowRight: () => panBy(-step, 0, true),
      ArrowUp: () => panBy(0, step, true),
      ArrowDown: () => panBy(0, -step, true),
    }
    const action = keys[e.key]
    if (action && e.target === e.currentTarget) {
      e.preventDefault()
      action()
    }
  }

  return {
    view,
    smooth,
    dragging,
    zoomBy,
    fit,
    centerOn,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture, onKeyDown },
  }
}
