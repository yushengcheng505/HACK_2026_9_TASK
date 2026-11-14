import { useImperativeHandle, useRef } from 'react'
import type { Ref } from 'react'
import type { ParticleApi } from '../model/particles'

const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)'
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const SAMPLES = 28
const MAX_LIVE = 64

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Метки артефактов и «перелёты» роботов по рёбрам графа: точки берём из отрисованного SVG-пути. */
export function ParticleLayer({ handle }: { handle: Ref<ParticleApi> }) {
  const root = useRef<HTMLDivElement>(null)
  const live = useRef(0)

  useImperativeHandle(handle, () => {
    const pathOf = (edgeId: string) =>
      root.current?.parentElement?.querySelector<SVGPathElement>(`path[data-edge="${CSS.escape(edgeId)}"]`) ?? null

    const track = (el: HTMLElement, animation: Animation) => {
      live.current++
      return animation.finished
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          live.current--
          el.remove()
        })
    }

    return {
      send(edgeId, label, tone, delay = 0) {
        const layer = root.current
        const path = pathOf(edgeId)
        if (!layer || !path || live.current >= MAX_LIVE || reduced()) return
        const length = path.getTotalLength()
        const frames: Keyframe[] = []
        for (let i = 0; i <= SAMPLES; i++) {
          const t = i / SAMPLES
          const p = path.getPointAtLength(length * t)
          const opacity = t < 0.08 ? t / 0.08 : t > 0.9 ? (1 - t) / 0.1 : 1
          frames.push({ transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`, opacity })
        }
        const el = document.createElement('div')
        el.className = `af-particle af-tone-${tone}`
        el.innerHTML = '<i></i><span></span>'
        el.querySelector('span')!.textContent = label
        layer.appendChild(el)
        void track(el, el.animate(frames, { duration: Math.min(1700, 650 + length * 0.9), delay, easing: EASE_IN_OUT, fill: 'both' }))
      },

      carry(edgeId, source, delay) {
        const layer = root.current
        const path = pathOf(edgeId)
        if (!layer || !path || reduced()) return null
        const length = path.getTotalLength()
        const duration = Math.min(1150, 620 + length * 0.55)
        const frames: Keyframe[] = []
        for (let i = 0; i <= SAMPLES; i++) {
          const t = i / SAMPLES
          const p = path.getPointAtLength(length * t)
          // Робот «подпрыгивает» над ребром и чуть растёт в полёте, приземляется с лёгким сжатием.
          const hop = Math.sin(t * Math.PI) * 22
          const scale = 0.55 + Math.sin(t * Math.PI) * 0.35 + t * 0.15
          const tilt = Math.sin(t * Math.PI * 2) * 8
          frames.push({
            transform: `translate(${p.x}px, ${p.y - hop}px) translate(-50%, -50%) rotate(${tilt}deg) scale(${scale})`,
            opacity: t < 0.1 ? t / 0.1 : t > 0.92 ? (1 - t) / 0.08 : 1,
          })
        }
        const el = document.createElement('div')
        el.className = 'af-seed'
        el.appendChild(source.cloneNode(true))
        layer.appendChild(el)
        const landed = track(el, el.animate(frames, { duration, delay, easing: EASE_IN_OUT, fill: 'both' }))
        return { duration, landed }
      },

      burst(x, y, tone, delay = 0) {
        const layer = root.current
        if (!layer || reduced()) return
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2 + (i % 2) * 0.3
          const dist = 30 + (i % 3) * 12
          const el = document.createElement('div')
          el.className = `af-spark af-tone-${tone}`
          layer.appendChild(el)
          void track(
            el,
            el.animate(
              [
                { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(1)`, opacity: 1 },
                { transform: `translate(${x + Math.cos(angle) * dist}px, ${y + Math.sin(angle) * dist}px) translate(-50%, -50%) scale(0.2)`, opacity: 0 },
              ],
              { duration: 560 + (i % 4) * 60, delay, easing: EASE_OUT, fill: 'both' },
            ),
          )
        }
      },
    }
  }, [])

  return <div ref={root} className="pointer-events-none absolute inset-0 z-20" aria-hidden="true" />
}
