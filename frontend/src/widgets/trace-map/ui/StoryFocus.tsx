import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { REQ_TYPE, TASK_TYPE, contractOpStatus, nodeKey, parseKey, shortOp, traceOf } from '@/entities/run'
import type { OpStatus, Requirement, RunView, SourceRef, Story, Task, TraceEdge } from '@/entities/run'
import { plural } from '@/shared/lib/plural'

interface StoryFocusProps {
  view: RunView
  selected: string | null
  onSelect: (key: string | null) => void
  /** Подсветить источники пробела (вкладка «Пробелы» / инспектор). */
  gapId: string | null
}

/** Дорожка: одна история и всё, из чего она выросла и во что разложилась. story = null — требования без истории. */
interface Lane {
  key: string
  story: Story | null
  reqs: Requirement[]
  sources: SourceRef[]
}

interface Point {
  l: number
  r: number
  y: number
}

const OP_BAR: Record<OpStatus, string> = {
  covered: 'bg-brand',
  no_tests: 'bg-amber',
  no_tasks: 'bg-hazard',
  unused: 'bg-line-input',
  pending: 'bg-line-strong',
}
const NO_TASKS: Task[] = []
/** Сколько источников видно сразу; остальные — по кнопке «ещё N». */
const SOURCES_SHOWN = 6
const COLS = 'grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-x-12'

function lanesOf(view: RunView): Lane[] {
  const reqById = new Map(view.requirements.map((r) => [r.id, r]))
  const srcById = new Map(view.sources.map((s) => [s.id, s]))
  const sourcesOf = (reqs: Requirement[]) =>
    [...new Set(reqs.flatMap((r) => r.source_refs))].flatMap((id) => {
      const s = srcById.get(id)
      return s ? [s] : []
    })
  const lanes: Lane[] = view.stories.map((story) => {
    const reqs = story.requirement_ids.flatMap((id) => {
      const r = reqById.get(id)
      return r ? [r] : []
    })
    return { key: story.id, story, reqs, sources: sourcesOf(reqs) }
  })
  const used = new Set(view.stories.flatMap((s) => s.requirement_ids))
  const orphan = view.requirements.filter((r) => !used.has(r.id))
  if (orphan.length) lanes.push({ key: 'orphan', story: null, reqs: orphan, sources: sourcesOf(orphan) })
  return lanes
}

/** Есть ли узел карты в дорожке. */
function laneHas(lane: Lane, key: string): boolean {
  const { column, id } = parseKey(key)
  if (column === 'story') return lane.story?.id === id
  if (column === 'task') return !!lane.story?.tasks.some((t) => t.id === id)
  if (column === 'requirement') return lane.reqs.some((r) => r.id === id)
  return lane.sources.some((s) => s.id === id)
}

function edgePath(a: Point, b: Point): string {
  const dx = Math.max(20, (b.l - a.r) / 2)
  return `M ${a.r} ${a.y} C ${a.r + dx} ${a.y}, ${b.l - dx} ${b.y}, ${b.l} ${b.y}`
}

interface Focus {
  /** Цепочка наведённого или выбранного узла. */
  chain: Set<string> | null
  /** Цепочка выбрана кликом — остальное гаснет; при наведении только подсвечиваются связи. */
  pinned: boolean
  selected: string | null
  gapSources: Set<string>
}

interface LaneViewProps {
  lane: Lane
  view: RunView
  focus: Focus
  storiesByReq: Map<string, string[]>
  gapsBySource: Map<string, string[]>
  onPick: (key: string) => void
  onHover: (key: string | null) => void
  /** Историй ещё нет: требования показаны без пометки «не попали в историю». */
  pending: boolean
}

/** Цепочка одной истории: источники → требования → история → задачи. */
function LaneView({ lane, view, focus, storiesByReq, gapsBySource, onPick, onHover, pending }: LaneViewProps) {
  const root = useRef<HTMLElement>(null)
  const [geo, setGeo] = useState<{ w: number; h: number; pos: Map<string, Point> }>({ w: 0, h: 0, pos: new Map() })
  const [expanded, setExpanded] = useState(false)
  const { story } = lane
  const tasks = story?.tasks ?? NO_TASKS
  const running = view.status !== 'done' && view.status !== 'failed'
  const ghosts = story && running ? view.retired.filter((r) => r.storyId === story.id) : []

  // Источники пробела — первыми, чтобы не прятались под «ещё N».
  const ordered = useMemo(
    () => [...lane.sources].sort((a, b) => Number(focus.gapSources.has(nodeKey('source', b.id))) - Number(focus.gapSources.has(nodeKey('source', a.id)))),
    [lane.sources, focus.gapSources],
  )
  const hiddenSelected = !!focus.selected && ordered.slice(SOURCES_SHOWN).some((s) => nodeKey('source', s.id) === focus.selected)
  const open = expanded || hiddenSelected
  const shown = open ? ordered : ordered.slice(0, SOURCES_SHOWN)
  const rest = ordered.length - SOURCES_SHOWN

  const measure = useCallback(() => {
    const el = root.current
    if (!el) return
    const base = el.getBoundingClientRect()
    const pos = new Map<string, Point>()
    for (const node of el.querySelectorAll<HTMLElement>('[data-k]')) {
      const r = node.getBoundingClientRect()
      pos.set(node.dataset.k!, { l: r.left - base.left, r: r.right - base.left, y: r.top - base.top + r.height / 2 })
    }
    setGeo({ w: el.offsetWidth, h: el.offsetHeight, pos })
  }, [])

  useLayoutEffect(measure, [measure, lane, tasks, ghosts.length, open])
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    let raf = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [measure])

  const storyKey = story ? nodeKey('story', story.id) : null
  const edges = useMemo<TraceEdge[]>(() => {
    const here = new Set(lane.sources.map((s) => s.id))
    const list: TraceEdge[] = []
    for (const r of lane.reqs) {
      for (const ref of r.source_refs) if (here.has(ref)) list.push({ from: nodeKey('source', ref), to: nodeKey('requirement', r.id) })
      if (storyKey) list.push({ from: nodeKey('requirement', r.id), to: storyKey })
    }
    if (storyKey) for (const t of tasks) list.push({ from: storyKey, to: nodeKey('task', t.id) })
    return list
  }, [lane, tasks, storyKey])

  /** Прямые ссылки задачи на источники — пунктиром и только для выбранной цепочки. */
  const beams = useMemo<TraceEdge[]>(() => {
    const chain = focus.chain
    if (!focus.pinned || !chain) return []
    const here = new Set(lane.sources.map((s) => s.id))
    return tasks
      .filter((t) => chain.has(nodeKey('task', t.id)))
      .flatMap((t) =>
        t.source_refs
          .filter((ref) => here.has(ref) && chain.has(nodeKey('source', ref)))
          .map((ref) => ({ from: nodeKey('source', ref), to: nodeKey('task', t.id) })),
      )
  }, [focus, lane.sources, tasks])

  const inChain = (k: string) => !!focus.chain?.has(k)
  const cardDim = (k: string) => (focus.pinned ? !inChain(k) : focus.gapSources.size > 0 && !focus.gapSources.has(k))

  const card = (k: string, body: ReactNode, extra = '') => {
    const active = focus.selected === k
    const gap = focus.gapSources.has(k)
    return (
      <button
        key={k}
        data-k={k}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onPick(k)
        }}
        onPointerEnter={() => onHover(k)}
        onPointerLeave={() => onHover(null)}
        className={`relative z-[1] flex w-full cursor-pointer flex-col gap-1 overflow-hidden rounded-[10px] border px-3 py-2 text-left break-words transition-[border-color,background-color,opacity] duration-200 ${
          active
            ? 'border-brand bg-panel glow-brand'
            : gap
              ? 'border-hazard bg-hazard-deep/30'
              : inChain(k)
                ? 'border-brand/60 bg-panel'
                : 'border-line bg-surface hover:border-line-input hover:bg-panel'
        } ${cardDim(k) ? 'opacity-30' : ''} ${extra}`}
      >
        {body}
      </button>
    )
  }

  return (
    <section ref={root} className={`relative rounded-2xl border border-line bg-ink/60 px-5 py-5 ${COLS} ${pending ? 'items-start' : 'items-center'}`}>
      <svg className="pointer-events-none absolute top-0 left-0 z-0 overflow-visible" width={geo.w} height={geo.h} aria-hidden="true">
        {edges.map((e) => {
          const a = geo.pos.get(e.from)
          const b = geo.pos.get(e.to)
          if (!a || !b) return null
          const on = inChain(e.from) && inChain(e.to)
          const d = edgePath(a, b)
          return (
            <g key={`${e.from}>${e.to}`}>
              <path
                d={d}
                fill="none"
                strokeWidth={on ? 2 : 1.25}
                className={`transition-[stroke,opacity] duration-200 ${on ? 'stroke-brand opacity-95' : focus.chain ? 'stroke-brand opacity-[0.08]' : 'stroke-brand opacity-30'}`}
              />
              {on && focus.pinned && <path d={d} fill="none" strokeWidth={2} className="fx-flow stroke-brand-hover" />}
            </g>
          )
        })}
        {beams.map((e) => {
          const a = geo.pos.get(e.from)
          const b = geo.pos.get(e.to)
          if (!a || !b) return null
          return <path key={`beam:${e.from}>${e.to}`} d={edgePath(a, b)} fill="none" strokeWidth={1.25} strokeDasharray="6 5" className="fx-flow stroke-mint opacity-70" />
        })}
      </svg>

      {/* источники */}
      <div className="flex flex-col gap-1">
        <span className="mb-1 text-[12px] font-semibold text-fg-dim">Источники</span>
        {lane.sources.length === 0 && <span className="text-[12px] text-fg-dim">нет ссылок</span>}
        {shown.map((s) => {
          const isOp = s.kind === 'proto_rpc' || s.kind === 'openapi_op'
          const short = isOp || s.kind === 'proto_message' ? shortOp(s) : null
          const gaps = gapsBySource.get(s.id)
          return card(
            nodeKey('source', s.id),
            <>
              {isOp && <span className={`absolute inset-y-0 left-0 w-[3px] ${OP_BAR[contractOpStatus(view, s.id)]}`} />}
              <span className="flex min-w-0 items-center gap-2" title={short ? `${short.scope}.${short.name}` : `${s.id} · ${s.title}`}>
                {short ? (
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold text-fg">{short.name}</span>
                ) : (
                  <>
                    <span className="shrink-0 font-mono text-[11px] text-fg-dim">{s.id}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">{s.title}</span>
                  </>
                )}
                {gaps?.map((g) => (
                  <span key={g} className="shrink-0 rounded-[4px] bg-hazard px-1 font-mono text-[9.5px] font-bold text-ink">
                    {g}
                  </span>
                ))}
              </span>
            </>,
            `py-1.5 ${isOp ? 'pl-4' : ''}`,
          )
        })}
        {rest > 0 && !hiddenSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="press mt-0.5 cursor-pointer self-start rounded-md px-2 py-1 font-mono text-[11px] text-fg-dim hover:bg-surface hover:text-fg"
          >
            {open ? 'свернуть' : `+ ещё ${rest}`}
          </button>
        )}
      </div>

      {/* требования */}
      <div className="flex flex-col gap-1.5">
        <span className="mb-1 text-[12px] font-semibold text-fg-dim">Требования</span>
        {lane.reqs.map((r) => {
          const elsewhere = (storiesByReq.get(r.id) ?? []).filter((id) => id !== story?.id)
          return card(
            nodeKey('requirement', r.id),
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="shrink-0 font-mono text-[11px] font-bold text-fg">{r.id}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {elsewhere.length > 0 && (
                    <span className="truncate font-mono text-[9.5px] text-fg-dim" title={`также в ${elsewhere.join(', ')}`}>
                      также {elsewhere.join(', ')}
                    </span>
                  )}
                  <span className="tag shrink-0 text-[9.5px] text-fg-dim">{REQ_TYPE[r.type]}</span>
                </span>
              </span>
              <span className="line-clamp-2 text-[12.5px] leading-snug text-fg-soft">{r.text}</span>
            </>,
          )
        })}
      </div>

      {/* история — узел дорожки */}
      <div className="flex flex-col">
        {story && storyKey ? (
          card(
            storyKey,
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] font-bold text-brand">{story.id}</span>
                <span className="font-mono text-[10.5px] text-fg-dim">
                  {story.acceptance_criteria.length} {plural(story.acceptance_criteria.length, 'критерий', 'критерия', 'критериев')}
                </span>
              </span>
              <span className="text-[14px] leading-snug font-semibold text-fg">{story.title}</span>
            </>,
            'py-3.5 border-brand/30',
          )
        ) : pending ? (
          <div className="relative overflow-hidden rounded-[10px] border border-dashed border-line-strong px-3 py-3">
            {running && <div className="fx-scan absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-brand/10 to-transparent" />}
            <span className={`font-mono text-[11px] font-bold ${running ? 'text-brand' : 'text-fg-dim'}`}>
              {running ? 'Истории пишутся' : 'Историй нет'}
              {running && <span className="fx-blink">_</span>}
            </span>
            <p className="mt-1 text-[12.5px] leading-snug text-fg-muted">
              {running ? 'Автор историй раскладывает требования.' : 'Прогон остановился до историй.'}
            </p>
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-hazard/50 px-3 py-3">
            <span className="font-mono text-[11px] font-bold text-hazard">Без истории</span>
            <p className="mt-1 text-[12.5px] leading-snug text-fg-muted">Эти требования не попали ни в одну историю.</p>
          </div>
        )}
      </div>

      {/* задачи */}
      <div className="flex flex-col gap-1.5">
        <span className="mb-1 text-[12px] font-semibold text-fg-dim">Задачи</span>
        {story && tasks.length === 0 && <span className="text-[12px] text-fg-dim">{running ? 'генерируются…' : 'нет задач'}</span>}
        {tasks.map((t) => {
          const type = TASK_TYPE[t.type]
          const broken = view.issues.some((i) => i.severity === 'error' && i.target_id === t.id)
          return card(
            nodeKey('task', t.id),
            <>
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-bold text-fg">{t.id}</span>
                <span className="flex items-center gap-1.5">
                  {broken && <span className="tag text-[9.5px] text-hazard">брак</span>}
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
    </section>
  )
}

function StoryFocusImpl({ view, selected, onSelect, gapId }: StoryFocusProps) {
  const [hover, setHover] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  /** Переключили стрелками — без анимации: действие с клавиатуры повторяют часто. */
  const [instant, setInstant] = useState(false)
  const lanes = useMemo(() => lanesOf(view), [view])

  const gapSources = useMemo(() => {
    const gap = view.gaps.find((g) => g.id === gapId)
    return new Set(gap ? gap.source_refs.map((r) => nodeKey('source', r)) : [])
  }, [view.gaps, gapId])
  const gapsBySource = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const g of view.gaps) for (const ref of g.source_refs) map.set(ref, [...(map.get(ref) ?? []), g.id])
    return map
  }, [view.gaps])
  const storiesByReq = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const s of view.stories) for (const r of s.requirement_ids) map.set(r, [...(map.get(r) ?? []), s.id])
    return map
  }, [view.stories])

  const focusKey = selected ?? hover
  const chain = useMemo(() => (focusKey ? traceOf(view, focusKey) : null), [view, focusKey])
  const focus = useMemo<Focus>(() => ({ chain, pinned: !!selected, selected, gapSources }), [chain, selected, gapSources])

  // Узел выбран в инспекторе, таблице или ОТК, либо пришли «на карту» из пробела — показываем историю, где он есть.
  const preferred = lanes.find((l) => l.key === chosen) ?? lanes[0]
  const laneFor = (key: string) => (preferred && laneHas(preferred, key) ? preferred : lanes.find((l) => laneHas(l, key)))
  const current = (selected && laneFor(selected)) || [...gapSources].map(laneFor).find(Boolean) || preferred
  // Запоминаем показанную историю, чтобы после сброса выбора экран не прыгал назад.
  if (current && current.key !== chosen) setChosen(current.key)

  const open = useCallback(
    (key: string, viaKeyboard = false) => {
      setChosen(key)
      setHover(null)
      setInstant(viaKeyboard)
      if (selected || gapId) onSelect(null)
    },
    [selected, gapId, onSelect],
  )
  const pick = useCallback((key: string) => onSelect(selected === key ? null : key), [onSelect, selected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      const i = lanes.findIndex((l) => l.key === current?.key)
      const next = lanes[i + (e.key === 'ArrowDown' ? 1 : -1)]
      if (!next) return
      e.preventDefault()
      open(next.key, true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lanes, current, open])

  const pending = view.stories.length === 0
  const running = view.status !== 'done' && view.status !== 'failed'

  if (!current) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <p className={`text-[14px] font-semibold ${running ? 'text-brand' : 'text-fg'}`}>
            {running ? 'Разбираю входы и выделяю требования' : 'Требований нет'}
            {running && <span className="fx-blink">_</span>}
          </p>
          <p className="mt-1 text-[13px] text-fg-muted">
            {running ? 'Истории появятся слева, как только Автор историй разложит требования.' : 'Прогон остановился до требований.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full grid-cols-[236px_minmax(0,1fr)]">
      <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-line px-3 py-4" aria-label="Истории">
        <span className="mb-1 px-2 text-[12px] font-semibold text-fg-dim">
          Истории <span className="font-mono font-normal">{view.stories.length}</span>
        </span>
        {lanes.map((lane) => {
          const on = lane.key === current.key
          const gap = lane.sources.some((s) => gapsBySource.has(s.id))
          const redo = !!lane.story && view.criticNotes.some((n) => n.story_id === lane.story!.id)
          const broken = !!lane.story && view.issues.some((i) => i.severity === 'error' && lane.story!.tasks.some((t) => t.id === i.target_id))
          const n = lane.story?.tasks.length ?? 0
          return (
            <button
              key={lane.key}
              type="button"
              onClick={() => open(lane.key)}
              aria-current={on ? 'true' : undefined}
              className={`press relative flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2 text-left ${
                on ? 'bg-panel shadow-[inset_0_0_0_1px_rgb(1_222_130/0.35)]' : 'hover:bg-surface'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`font-mono text-[12px] font-bold ${lane.story ? (on ? 'text-brand' : 'text-fg') : pending ? 'text-fg' : 'text-hazard'}`}>
                  {lane.story ? lane.story.id : pending ? 'Требования' : 'Без истории'}
                </span>
                {gap && <span className="size-1.5 rounded-full bg-hazard" title="в источниках есть пробел" />}
                {redo && <span className="font-mono text-[10.5px] text-amber" title="была доработка по находкам">↺</span>}
                {broken && <span className="tag text-[9.5px] text-hazard">брак</span>}
                <span className="ml-auto font-mono text-[10.5px] text-fg-dim">
                  {lane.story ? `${n} ${plural(n, 'задача', 'задачи', 'задач')}` : lane.reqs.length}
                </span>
              </span>
              {lane.story && <span className={`truncate text-[12px] ${on ? 'text-fg-soft' : 'text-fg-dim'}`}>{lane.story.title}</span>}
            </button>
          )
        })}
        {pending && <span className="px-2 text-[12px] leading-snug text-fg-dim">{running ? 'Истории появятся здесь.' : 'Историй нет.'}</span>}
        <span className="mt-auto px-2 pt-3 font-mono text-[10.5px] text-fg-dim/70">↑ ↓ — соседняя история</span>
      </nav>

      <div className="min-h-0 overflow-auto p-5" onClick={(e) => e.target === e.currentTarget && onSelect(null)}>
        <div key={current.key} className={`min-w-[900px] ${instant ? '' : 'fx-fade'}`}>
          <LaneView
            lane={current}
            view={view}
            focus={focus}
            storiesByReq={storiesByReq}
            gapsBySource={gapsBySource}
            onPick={pick}
            onHover={setHover}
            pending={pending}
          />
        </div>
      </div>
    </div>
  )
}

const KEYS: (keyof RunView)[] = ['sources', 'requirements', 'stories', 'retired', 'gaps', 'issues', 'coverage', 'criticNotes', 'status']

/** Токены модели меняют view каждый кадр — карта перерисовывается только при изменении своих данных. */
export const StoryFocus = memo(
  StoryFocusImpl,
  (a, b) => a.selected === b.selected && a.gapId === b.gapId && a.onSelect === b.onSelect && KEYS.every((k) => a.view[k] === b.view[k]),
)
