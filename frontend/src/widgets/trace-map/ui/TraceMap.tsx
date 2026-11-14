import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { REQ_TYPE, TASK_TYPE, contractOpStatus, nodeKey, parseKey, shortOp, traceEdges, traceOf } from '@/entities/run'
import type { OpStatus, RunView, SourceRef, TraceEdge } from '@/entities/run'
import { sourceGroups } from '../model/columns'

interface TraceMapProps {
  view: RunView
  selected: string | null
  onSelect: (key: string | null) => void
  /** Подсветить источники пробела (вкладка «Пробелы» / инспектор). */
  gapId: string | null
}

interface Point {
  l: number
  r: number
  y: number
}

const OP_STYLE: Record<OpStatus, { bar: string; note: string; noteCls: string }> = {
  covered: { bar: 'bg-brand', note: 'покрыт', noteCls: 'text-brand' },
  no_tests: { bar: 'bg-amber', note: 'нет теста', noteCls: 'text-amber' },
  no_tasks: { bar: 'bg-hazard', note: 'нет задач', noteCls: 'text-hazard' },
  unused: { bar: 'bg-line-input', note: 'подтвердите', noteCls: 'text-fg-dim' },
  pending: { bar: 'bg-line-strong', note: '', noteCls: '' },
}

function edgePath(a: Point, b: Point): string {
  const dx = Math.max(24, (b.l - a.r) / 2)
  return `M ${a.r} ${a.y} C ${a.r + dx} ${a.y}, ${b.l - dx} ${b.y}, ${b.l} ${b.y}`
}

function TraceMapImpl({ view, selected, onSelect, gapId }: TraceMapProps) {
  const content = useRef<HTMLDivElement>(null)
  const [burst, setBurst] = useState(true)
  const [geo, setGeo] = useState<{ w: number; h: number; pos: Map<string, Point> }>({ w: 0, h: 0, pos: new Map() })

  useEffect(() => {
    const timer = window.setTimeout(() => setBurst(false), 900)
    return () => window.clearTimeout(timer)
  }, [])

  const measure = useCallback(() => {
    const root = content.current
    if (!root) return
    const base = root.getBoundingClientRect()
    const pos = new Map<string, Point>()
    for (const el of root.querySelectorAll<HTMLElement>('[data-trace-key]')) {
      const key = el.dataset.traceKey!
      const r = el.getBoundingClientRect()
      pos.set(key, { l: r.left - base.left, r: r.right - base.left, y: r.top - base.top + Math.min(r.height / 2, 18) })
    }
    setGeo({ w: root.scrollWidth, h: root.scrollHeight, pos })
  }, [])

  useLayoutEffect(() => {
    measure()
    const late = window.setTimeout(measure, 280)
    return () => window.clearTimeout(late)
  }, [measure, view.sources, view.requirements, view.stories, view.retired, view.coverage])

  useLayoutEffect(() => {
    const root = content.current
    if (!root) return
    let raf = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    observer.observe(root)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [measure])

  const [hover, setHover] = useState<string | null>(null)
  const groups = useMemo(() => sourceGroups(view), [view])
  const edges = useMemo(() => traceEdges(view), [view])
  const trace = useMemo(() => (selected ? traceOf(view, selected) : null), [view, selected])
  // Наведение без выбора — лёгкий предпросмотр цепочки: связи и рамки подсвечены, остальное не гаснет.
  const preview = useMemo(() => (!selected && hover ? traceOf(view, hover) : null), [view, selected, hover])

  const gapSources = useMemo(() => {
    const gap = view.gaps.find((g) => g.id === gapId)
    return new Set(gap ? gap.source_refs.map((r) => nodeKey('source', r)) : [])
  }, [view.gaps, gapId])

  /** Луч «задача → источник»: прямые ссылки задачи на контракт и документы — только для выбранной цепочки. */
  const beams = useMemo<TraceEdge[]>(() => {
    if (!selected || !trace) return []
    const { column } = parseKey(selected)
    if (column !== 'task' && column !== 'source') return []
    const known = new Set(view.sources.map((s) => s.id))
    return view.stories.flatMap((s) =>
      s.tasks
        .filter((t) => trace.has(nodeKey('task', t.id)))
        .flatMap((t) =>
          t.source_refs
            .filter((ref) => known.has(ref) && (column === 'task' || selected === nodeKey('source', ref)))
            .map((ref) => ({ from: nodeKey('source', ref), to: nodeKey('task', t.id) })),
        ),
    )
  }, [selected, trace, view.sources, view.stories])

  const gapsBySource = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const g of view.gaps) for (const ref of g.source_refs) map.set(ref, [...(map.get(ref) ?? []), g.id])
    return map
  }, [view.gaps])

  const errorTargets = useMemo(
    () => new Set(view.issues.filter((i) => i.severity === 'error').map((i) => i.target_id)),
    [view.issues],
  )
  const criticStories = useMemo(() => new Set(view.criticNotes.map((n) => n.story_id)), [view.criticNotes])
  const uncovered = new Set(view.coverage?.uncovered_requirements ?? [])

  const stagger = (i: number) => (burst ? { animationDelay: `${Math.min(i * 14, 420)}ms` } : undefined)
  const dimmed = (key: string) => (trace ? !trace.has(key) : gapSources.size ? !gapSources.has(key) : false)
  const toggle = (key: string) => onSelect(selected === key ? null : key)

  const node = (key: string, i: number, body: ReactNode, extra = '') => {
    const active = selected === key
    const lit = !!trace?.has(key) || gapSources.has(key)
    return (
      <button
        key={key}
        data-trace-key={key}
        type="button"
        onClick={() => toggle(key)}
        onPointerEnter={() => setHover(key)}
        onPointerLeave={() => setHover((h) => (h === key ? null : h))}
        style={stagger(i)}
        className={`fx-enter group relative z-[1] flex w-full cursor-pointer flex-col gap-1 overflow-hidden rounded-[10px] border bg-surface px-3 py-2 text-left break-words transition-[border-color,background-color] duration-200 [&>*]:transition-opacity [&>*]:duration-200 ${
          active
            ? 'border-brand bg-panel glow-brand'
            : gapSources.has(key)
              ? 'border-hazard bg-hazard-deep/30'
              : lit
                ? 'border-brand/60 bg-panel'
                : preview?.has(key)
                  ? 'border-brand/40 bg-panel'
                  : 'border-line hover:border-line-input hover:bg-panel'
        } ${dimmed(key) ? '[&>*]:opacity-25' : ''} ${extra}`}
      >
        {body}
      </button>
    )
  }

  const sourceBody = (s: SourceRef) => {
    const gaps = gapsBySource.get(s.id)
    const isOp = s.kind === 'proto_rpc' || s.kind === 'openapi_op'
    const op = isOp ? OP_STYLE[contractOpStatus(view, s.id)] : null
    const short = isOp || s.kind === 'proto_message' ? shortOp(s) : null
    return (
      <>
        {op && <span className={`absolute inset-y-0 left-0 w-[3px] ${op.bar}`} />}
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[10.5px] text-fg-dim">{short ? short.scope : s.id}</span>
          <span className="flex shrink-0 items-center gap-1">
            {gaps?.map((g) => (
              <span key={g} className="rounded-[4px] bg-hazard px-1 font-mono text-[9.5px] font-bold text-ink">
                {g}
              </span>
            ))}
            {op?.note && <span className={`tag text-[9.5px] ${op.noteCls}`}>{op.note}</span>}
          </span>
        </span>
        <span className={`line-clamp-2 text-[12.5px] leading-snug ${short ? 'font-mono font-bold text-fg' : 'text-fg-soft'}`}>
          {short ? short.name : s.title}
        </span>
      </>
    )
  }

  const sourcesCount = groups.reduce((n, g) => n + g.items.length, 0)
  const tasksCount = view.stories.reduce((n, s) => n + s.tasks.length, 0)
  const running = view.status !== 'done' && view.status !== 'failed'

  return (
    <div className="h-full overflow-auto" onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
      <div
        ref={content}
        className="relative grid min-w-[1000px] grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.25fr)] gap-x-12 px-6 pb-10"
      >
        <svg className="pointer-events-none absolute top-0 left-0 z-0 overflow-visible" width={geo.w} height={geo.h} aria-hidden="true">
          {edges.map((e) => {
            const a = geo.pos.get(e.from)
            const b = geo.pos.get(e.to)
            if (!a || !b) return null
            const chain = trace ?? preview
            const on = !!chain && chain.has(e.from) && chain.has(e.to)
            const d = edgePath(a, b)
            const len = Math.round(Math.abs(b.l - a.r) + Math.abs(b.y - a.y) + 40)
            return (
              <g key={`${e.from}>${e.to}`}>
                <path
                  d={d}
                  fill="none"
                  className={`fx-draw transition-[stroke,opacity] duration-200 ${
                    on
                      ? 'stroke-brand opacity-90'
                      : chain || gapSources.size
                        ? 'stroke-line-strong opacity-[0.12]'
                        : 'stroke-line-input opacity-35'
                  }`}
                  strokeWidth={on ? 1.5 : 1}
                  style={{ ['--len' as string]: len }}
                />
                {on && trace && <path d={d} fill="none" className="fx-flow stroke-brand-hover" strokeWidth={2} />}
              </g>
            )
          })}
          {beams.map((e) => {
            const a = geo.pos.get(e.from)
            const b = geo.pos.get(e.to)
            if (!a || !b) return null
            return (
              <path
                key={`beam:${e.from}>${e.to}`}
                d={edgePath(a, b)}
                fill="none"
                strokeWidth={1.25}
                strokeDasharray="6 5"
                className="fx-flow stroke-mint opacity-80"
              />
            )
          })}
        </svg>

        {(
          [
            ['Источники', sourcesCount],
            ['Требования', view.requirements.length],
            ['Истории', view.stories.length],
            ['Задачи', tasksCount],
          ] as const
        ).map(([title, count]) => (
          <div key={title} className="sticky top-0 z-[3] -mx-2 mb-3 flex items-baseline gap-2 bg-ink/95 px-2 pt-4 pb-2.5 whitespace-nowrap backdrop-blur-[2px]">
            <span className="text-[13px] font-semibold text-fg">{title}</span>
            <span className="font-mono text-[11px] text-fg-dim">{count}</span>
          </div>
        ))}

        {/* источники */}
        <div className="flex flex-col gap-4">
          {groups.length === 0 && <ColumnPlaceholder text="Разбираю входы" active={running} />}
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-1.5">
              <span className="tag text-[10px] text-brand-mid">
                {g.title} · {g.items.length}
              </span>
              {g.items.map((s, i) => node(nodeKey('source', s.id), i, sourceBody(s), s.kind === 'proto_rpc' || s.kind === 'openapi_op' ? 'pl-4' : ''))}
            </div>
          ))}
        </div>

        {/* требования */}
        <div className="flex flex-col gap-1.5">
          {view.requirements.length === 0 && <ColumnPlaceholder text="Выделяю требования" active={running && view.sources.length > 0} />}
          {view.requirements.map((r, i) =>
            node(
              nodeKey('requirement', r.id),
              i,
              <>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-fg">{r.id}</span>
                  <span className="flex items-center gap-1.5">
                    {uncovered.has(r.id) && <span className="tag text-[9.5px] text-hazard">без задач</span>}
                    <span className="tag text-[9.5px] text-fg-dim">{REQ_TYPE[r.type]}</span>
                  </span>
                </span>
                <span className="line-clamp-2 text-[12.5px] leading-snug text-fg-soft">{r.text}</span>
              </>,
              uncovered.has(r.id) ? 'border-l-hazard' : '',
            ),
          )}
        </div>

        {/* истории */}
        <div className="flex flex-col gap-1.5">
          {view.stories.length === 0 && <ColumnPlaceholder text="Жду требований и ответов" active={view.nodes.stories.phase === 'active'} />}
          {view.stories.map((s, i) =>
            node(
              nodeKey('story', s.id),
              i,
              <>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-brand">{s.id}</span>
                  <span className="flex items-center gap-1.5">
                    {criticStories.has(s.id) && <span className="tag rounded-[4px] bg-amber-deep px-1 text-[9.5px] text-amber">доработка</span>}
                    <span className="tag text-[9.5px] text-fg-dim">{s.tasks.length} задач</span>
                  </span>
                </span>
                <span className="line-clamp-3 text-[12.5px] leading-snug text-fg">{s.title}</span>
              </>,
            ),
          )}
        </div>

        {/* задачи */}
        <div className="flex flex-col gap-3">
          {tasksCount === 0 && <ColumnPlaceholder text="Раскладываю истории на задачи" active={view.nodes.tasks.phase === 'active'} />}
          {view.stories.map((s) => {
            const ghosts = running ? view.retired.filter((r) => r.storyId === s.id) : []
            if (!s.tasks.length && !ghosts.length) return null
            return (
              <div key={s.id} className="flex flex-col gap-1.5">
                <span className={`tag text-[10px] ${dimmed(nodeKey('story', s.id)) ? 'text-fg-dim/40' : 'text-brand-mid'}`}>
                  {s.id}
                </span>
                {s.tasks.map((t, i) => {
                  const type = TASK_TYPE[t.type]
                  return node(
                    nodeKey('task', t.id),
                    i,
                    <>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-fg">{t.id}</span>
                        <span className="flex items-center gap-1.5">
                          {errorTargets.has(t.id) && <span className="tag text-[9.5px] text-hazard">брак</span>}
                          {t.test_scenarios.length > 0 && <span className="tag text-[9.5px] text-amber">{t.test_scenarios.length} сц.</span>}
                          <span className={`rounded-[4px] border px-1 font-mono text-[9.5px] font-bold ${type?.cls ?? ''}`}>{type?.label ?? t.type}</span>
                        </span>
                      </span>
                      <span className="line-clamp-2 text-[12.5px] leading-snug text-fg-soft">{t.title}</span>
                    </>,
                  )
                })}
                {ghosts.map(({ task }) => (
                  <div key={`ghost:${task.id}`} className="fx-retire rounded-[10px] border border-dashed border-line-input px-3 py-1.5">
                    <span className="font-mono text-[11px] text-fg-dim line-through">{task.id}</span>{' '}
                    <span className="text-[12px] text-fg-dim line-through">{task.title}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ColumnPlaceholder({ text, active }: { text: string; active: boolean }) {
  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-line-strong">
      {active && <div className="fx-scan absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-brand/10 to-transparent" />}
      <span className={`tag ${active ? 'text-brand' : 'text-fg-dim/60'}`}>
        {text}
        {active && <span className="fx-blink">_</span>}
      </span>
    </div>
  )
}

const KEYS: (keyof RunView)[] = ['sources', 'requirements', 'stories', 'retired', 'gaps', 'issues', 'coverage', 'criticNotes', 'status', 'nodes']

/** Токены модели меняют view каждый кадр — карта перерисовывается только при изменении своих данных. */
export const TraceMap = memo(
  TraceMapImpl,
  (a, b) => a.selected === b.selected && a.gapId === b.gapId && a.onSelect === b.onSelect && KEYS.every((k) => a.view[k] === b.view[k]),
)
