import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { RunView } from '@/entities/run'
import { isLegacyReview } from '../model/agents'
import type { AgentInstance, AgentStatus } from '../model/agents'
import { metaFor } from '../model/meta'
import { CHIP, FLOW_WIDTH, flowHeight, layoutFlow } from '../model/layout'
import type { Edge, FlowLayout } from '../model/layout'
import type { ParticleApi } from '../model/particles'
import { usePanZoom } from '../model/usePanZoom'
import { AgentCard, Gate, GhostRows, InstanceChip, ResultNode } from './Nodes'
import { ParticleLayer } from './ParticleLayer'
import { ZoomControls } from './ZoomControls'

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
/** Интервал между рождениями соседних агентов, если истории пришли пачкой. */
const SPAWN_GAP = 170

function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, ...size }
}

/**
 * Рождение агента «по истории»: источник (Автор историй или ОТК) вздрагивает, из него по ребру
 * вылетает копия робота, ребро прорисовывается следом, на месте приземления узел появляется со вспышкой.
 */
function useSpawn(layout: FlowLayout | null, world: RefObject<HTMLDivElement | null>, particles: RefObject<ParticleApi | null>) {
  const clock = useRef(0)
  return useCallback(
    (chip: HTMLElement) => {
      const key = chip.dataset.node ?? ''
      const [role, storyId] = key.split(':')
      const box = layout?.boxes[key]
      const root = world.current
      const fx = particles.current
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!box || !root || !fx || reduce) {
        chip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease' })
        return
      }
      const now = performance.now()
      const delay = Math.max(0, clock.current - now)
      clock.current = Math.max(clock.current, now) + SPAWN_GAP

      const edgeId = role === 'tasks' ? `st-gen:${storyId}` : `gate-rev:${storyId}`
      const avatar = chip.querySelector('svg')
      const flight = avatar ? fx.carry(edgeId, avatar, delay) : null
      if (!flight) return

      chip.style.opacity = '0'
      root.querySelector<HTMLElement>(`[data-node="${role === 'tasks' ? 'stories' : 'gate'}"]`)?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.05, 0.95)', offset: 0.35 }, { transform: 'scale(1)' }],
        { duration: 320, delay, easing: EASE_OUT },
      )
      const path = root.querySelector<SVGPathElement>(`path[data-edge="${CSS.escape(edgeId)}"]`)
      if (path) {
        const len = path.getTotalLength()
        path.animate([{ strokeDasharray: `${len}`, strokeDashoffset: len }, { strokeDasharray: `${len}`, strokeDashoffset: 0 }], {
          duration: flight.duration,
          delay,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          fill: 'backwards',
        })
      }
      void flight.landed.then(() => {
        chip.style.opacity = ''
        chip.animate(
          [
            { opacity: 0, transform: 'scale(0.82)', filter: 'blur(3px)' },
            { opacity: 1, transform: 'scale(1.06)', filter: 'blur(0)', offset: 0.55 },
            { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
          ],
          { duration: 460, easing: EASE_OUT },
        )
        fx.burst(box.x - box.w / 2 + 30, box.y, role === 'tasks' ? 'brand' : 'mint')
      })
    },
    [layout, world, particles],
  )
}

interface FlowCanvasProps {
  view: RunView
  instances: AgentInstance[]
  selected: string | null
  onSelect: (key: string) => void
  particles: RefObject<ParticleApi | null>
  /** Прогон идёт на глазах (не догрузка готовой истории) — новые агенты рождаются с анимацией. */
  live: boolean
}

/** Граф агентов: декомпозиция → ОТК → проверка → скептик → итог, с петлёй доработки. Холст можно двигать и масштабировать. */
export function FlowCanvas({ view, instances, selected, onSelect, particles, live }: FlowCanvasProps) {
  const { ref: viewport, w, h } = useSize()
  const worldRef = useRef<HTMLDivElement>(null)
  const storyIds = useMemo(() => view.stories.map((s) => s.id), [view.stories])
  const world = useMemo(() => ({ w: FLOW_WIDTH, h: flowHeight(storyIds.length) }), [storyIds.length])
  const layout = useMemo(() => (w && h ? layoutFlow(storyIds) : null), [w, h, storyIds])
  const byKey = useMemo(() => new Map(instances.map((i) => [i.key, i])), [instances])
  const pz = usePanZoom(viewport, world, { w, h })
  const spawn = useSpawn(layout, worldRef, particles)
  const [hover, setHover] = useState<string | null>(null)
  const onHover = (key: string | null) => setHover(pz.dragging ? null : key)
  // Наведённый или выбранный узел: его рёбра подсвечены, остальные приглушены — путь легко проследить.
  const focus = hover ?? selected

  const statusOf = (key: string): AgentStatus => {
    if (key === 'prep') {
      const p = view.nodes.parse_inputs.phase
      const l = view.nodes.detect_language.phase
      return p === 'active' || l === 'active' ? 'working' : l === 'done' ? 'done' : 'idle'
    }
    if (key === 'gate') {
      const phase = view.nodes.checks.phase
      return phase === 'active' ? 'working' : phase === 'done' ? 'done' : 'idle'
    }
    if (key === 'result') return view.status === 'done' ? 'done' : view.nodes.finalize.phase === 'active' ? 'working' : 'idle'
    return byKey.get(key)?.status ?? 'idle'
  }

  // Рецензенты рождаются, когда начинается проверка; в старом режиме одного критика их нет.
  const reviewStarted =
    Object.keys(view.calls).some((k) => k.startsWith('review:')) || (view.nodes.critic.visits > 0 && !isLegacyReview(view))
  const redoStories = new Set(view.feedback.flatMap((f) => f.notes.map((n) => n.story_id)))
  const lastRedo = new Set(view.feedback.at(-1)?.notes.map((n) => n.story_id) ?? [])
  const hasGapReview = view.findings.some((f) => f.source === 'analyst') || Boolean(view.calls['skeptic:gaps'])

  const edgeState = (e: Edge): string => {
    if (!reviewStarted && (e.id.startsWith('gate-rev:') || e.id.startsWith('rev-sk:'))) return 'hidden'
    if (e.kind === 'loop') {
      const story = e.to.split(':')[1]
      if (!redoStories.has(story)) return 'hidden'
      return view.nodes.tasks.phase === 'active' && view.nodes.tasks.visits > 1 && lastRedo.has(story) ? 'loop-active' : 'loop'
    }
    if (e.kind === 'gaps') {
      if (!hasGapReview) return 'hidden'
      return view.nodes.analyst.phase === 'active' && statusOf('skeptic') === 'working' ? 'gaps-active' : 'gaps'
    }
    const from = statusOf(e.from)
    const to = statusOf(e.to)
    if (from === 'working' || to === 'working') return 'active'
    if (from === 'done' && to !== 'idle') return 'passed'
    return 'idle'
  }

  const nTasks = storyIds.length
  const firstRow = layout && storyIds.length ? layout.rows[storyIds[0]] : null
  const checks = view.nodes.checks
  const { x, y, k } = pz.view
  const chips = instances.filter((i) => i.storyId && (i.kind === 'tasks' || reviewStarted))

  return (
    <div
      ref={viewport}
      className={`af-canvas relative col-start-1 row-start-3 min-h-0 min-w-0 overflow-hidden ${pz.dragging ? 'af-grabbing' : ''}`}
      style={{ backgroundSize: `${22 * k}px ${22 * k}px`, backgroundPosition: `${x}px ${y}px` }}
      tabIndex={0}
      aria-label="Граф агентов: перетаскивайте, колесо — масштаб, 0 — вписать"
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('af-world')) pz.fit()
      }}
      {...pz.handlers}
    >
      {layout && (
        <div
          ref={worldRef}
          className="af-world"
          style={{
            width: world.w,
            height: world.h,
            transform: `translate(${x}px, ${y}px) scale(${k})`,
            transition: pz.smooth ? 'transform 320ms cubic-bezier(0.23, 1, 0.32, 1)' : 'none',
          }}
        >
          <svg className="pointer-events-none absolute inset-0 overflow-visible" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
            {(['decomposition', 'review'] as const).map((g) => {
              const b = layout.groups[g]
              return <rect key={g} className="af-group" x={b.x - b.w / 2} y={b.y - b.h / 2} width={b.w} height={b.h} rx="22" />
            })}
            {layout.edges.map((e) => {
              const state = edgeState(e)
              if (state === 'hidden') return null
              const lit = focus ? (e.from === focus || e.to === focus ? 'af-edge-lit' : 'af-edge-muted') : ''
              return (
                <g key={e.id} className={lit}>
                  <path d={e.d} className={`af-edge af-edge-${state}`} data-edge={e.id} />
                  {(state === 'active' || state === 'loop-active' || state === 'gaps-active') && (
                    <path d={e.d} className={`af-edge-flow af-edge-flow-${state}`} />
                  )}
                </g>
              )
            })}
          </svg>

          {(['decomposition', 'review'] as const).map((g) => {
            const b = layout.groups[g]
            return (
              <div key={g} className="af-group-label" style={{ left: b.x - b.w / 2 + 16, top: b.y - b.h / 2 + 12 }}>
                <span className="text-brand-mid">{g === 'decomposition' ? '01' : '02'}</span>
                {g === 'decomposition' ? 'Декомпозиция' : 'Проверка'}
              </div>
            )
          })}
          {view.criticRound > 0 && (
            <div className="af-loop-label" style={{ left: layout.col.tasks - CHIP.w / 2 - 20, top: layout.bottom + 6 }}>
              ↺ доработка по находкам · круг {view.criticRound}
            </div>
          )}

          {(['requirements', 'analyst', 'stories', 'junction', 'simplifier', 'skeptic'] as const).map((key) => {
            const inst = byKey.get(key)
            if (!inst) return null
            return <AgentCard key={key} inst={inst} box={layout.boxes[key]} meta={metaFor(inst, view)} selected={selected === key} onSelect={onSelect} onHover={onHover} />
          })}

          {nTasks === 0 && <GhostRows x={layout.col.tasks} y={layout.boxes.stories.y} label="генератор задач — по одному на историю" />}
          {!reviewStarted && <GhostRows x={layout.col.reviewer} y={layout.boxes.stories.y} label="рецензент — по одному на историю" />}
          {firstRow !== null && (
            <>
              <div className="af-col-label" style={{ left: layout.col.tasks, top: firstRow - CHIP.h / 2 - 22 }}>
                Генератор задач <b>×{nTasks}</b>
              </div>
              {reviewStarted && (
                <div className="af-col-label" style={{ left: layout.col.reviewer, top: firstRow - CHIP.h / 2 - 22 }}>
                  Рецензент <b>×{nTasks}</b>
                </div>
              )}
            </>
          )}
          {chips.map((inst) => (
            <InstanceChip
              key={inst.key}
              inst={inst}
              box={layout.boxes[inst.key]}
              meta={metaFor(inst, view)}
              selected={selected === inst.key}
              onSelect={onSelect}
              onHover={onHover}
              spawn={live ? spawn : undefined}
            />
          ))}

          <Gate
            box={layout.gate}
            phase={checks.phase}
            visits={checks.visits}
            coverage={view.coverage?.coverage_percent ?? null}
            errors={view.issues.filter((i) => i.severity === 'error').length}
            selected={selected === 'gate'}
            onSelect={() => onSelect('gate')}
            onHover={onHover}
          />
          <ResultNode box={layout.boxes.result} view={view} selected={selected === 'result'} onSelect={() => onSelect('result')} />
          <ParticleLayer handle={particles} />
        </div>
      )}
      <ZoomControls k={k} onZoomIn={() => pz.zoomBy(1.25)} onZoomOut={() => pz.zoomBy(0.8)} onFit={pz.fit} />
    </div>
  )
}
