import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { NodePhase, RunView } from '@/entities/run'
import { STATUS_LABEL } from '../model/agents'
import type { AgentInstance } from '../model/agents'
import type { Box } from '../model/layout'
import { BotAvatar } from './BotAvatar'

const place = (b: Box): CSSProperties => ({ left: b.x - b.w / 2, top: b.y - b.h / 2, width: b.w, height: b.h })

interface NodeProps {
  inst: AgentInstance
  box: Box
  meta: string
  selected: boolean
  onSelect: (key: string) => void
  /** Наведение: подсветить рёбра узла и приглушить остальные. */
  onHover?: (key: string | null) => void
}

/** Агент в единственном экземпляре: крупный робот, имя, статус и что он уже выдал. */
export function AgentCard({ inst, box, meta, selected, onSelect, onHover }: NodeProps) {
  return (
    <button
      type="button"
      data-node={inst.key}
      onClick={() => onSelect(inst.key)}
      onPointerEnter={() => onHover?.(inst.key)}
      onPointerLeave={() => onHover?.(null)}
      className={`af-node af-card af-status-${inst.status} ${selected ? 'af-selected' : ''}`}
      style={place(box)}
      aria-pressed={selected}
      aria-label={`${inst.name}: ${STATUS_LABEL[inst.status]}`}
    >
      <span className={`af-bot ${inst.status === 'working' ? 'af-bob' : ''}`}>
        <BotAvatar kind={inst.kind} status={inst.status} size={92} />
      </span>
      <span className="af-card-name">{inst.name}</span>
      <span className="af-card-meta">
        <i className="af-dot" />
        {inst.status === 'done' || inst.status === 'idle' ? meta || STATUS_LABEL[inst.status] : STATUS_LABEL[inst.status]}
      </span>
    </button>
  )
}

interface ChipProps extends NodeProps {
  /** Появился в живом прогоне: проиграть рождение (вызывается один раз при монтировании). */
  spawn?: (chip: HTMLElement) => void
}

/** Экземпляр «по одному на историю»: генератор задач или рецензент. */
export function InstanceChip({ inst, box, meta, selected, onSelect, onHover, spawn }: ChipProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const spawnOnMount = useRef(spawn)
  const spawned = useRef(false)
  useLayoutEffect(() => {
    // StrictMode в разработке монтирует эффекты дважды — рождаемся один раз.
    if (spawned.current || !ref.current) return
    spawned.current = true
    spawnOnMount.current?.(ref.current)
  }, [])

  return (
    <button
      ref={ref}
      type="button"
      data-node={inst.key}
      onClick={() => onSelect(inst.key)}
      onPointerEnter={() => onHover?.(inst.key)}
      onPointerLeave={() => onHover?.(null)}
      className={`af-node af-chip af-status-${inst.status} ${selected ? 'af-selected' : ''}`}
      style={place(box)}
      aria-pressed={selected}
      aria-label={`${inst.name} ${inst.storyId}: ${STATUS_LABEL[inst.status]}`}
    >
      <span className={`af-bot shrink-0 ${inst.status === 'working' ? 'af-bob' : ''}`}>
        <BotAvatar kind={inst.kind} status={inst.status} size={46} />
      </span>
      <span className="flex min-w-0 flex-col items-start leading-none">
        <span className="af-chip-id">{inst.storyId}</span>
        <span className="af-chip-meta">{inst.status === 'done' || inst.status === 'idle' ? meta || STATUS_LABEL[inst.status] : STATUS_LABEL[inst.status]}</span>
      </span>
      <i className="af-dot ml-auto" />
      {inst.status === 'working' && <span className="af-chip-progress" aria-hidden="true" />}
    </button>
  )
}

/** Пустые ряды, пока историй ещё нет: объясняют, что агентов будет по одному на историю. */
export function GhostRows({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <div className="af-ghost" style={{ left: x - 75, top: y - 84 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="af-ghost-chip" />
      ))}
      <span className="af-ghost-label">{label}</span>
    </div>
  )
}

interface GateProps {
  box: Box
  phase: NodePhase
  visits: number
  coverage: number | null
  errors: number
  selected: boolean
  onSelect: () => void
  onHover?: (key: string | null) => void
}

/** ОТК: детерминированные проверки кодом между генераторами и проверяющими. */
export function Gate({ box, phase, visits, coverage, errors, selected, onSelect, onHover }: GateProps) {
  return (
    <button
      type="button"
      data-node="gate"
      onClick={onSelect}
      onPointerEnter={() => onHover?.('gate')}
      onPointerLeave={() => onHover?.(null)}
      className={`af-gate af-gate-${phase} ${selected ? 'af-selected' : ''}`}
      style={place(box)}
      aria-label="ОТК: проверки кодом"
    >
      {phase === 'active' && <span className="af-gate-scan" aria-hidden="true" />}
      <span className="af-gate-label">ОТК · код{visits > 1 ? ` ×${visits}` : ''}</span>
      {coverage !== null && (
        <span className={`af-gate-cov ${errors ? 'text-hazard' : 'text-brand'}`}>{Math.round(coverage)}%</span>
      )}
    </button>
  )
}

interface ResultProps {
  box: Box
  view: RunView
  selected: boolean
  onSelect: () => void
}

/** Итог: что получилось после всех кругов. */
export function ResultNode({ box, view, selected, onSelect }: ResultProps) {
  const done = view.status === 'done'
  const tasks = view.stories.reduce((n, s) => n + s.tasks.length, 0)
  const rows = [
    ['REQ', view.requirements.length],
    ['US', view.stories.length],
    ['TASK', tasks],
  ] as const
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`af-node af-result ${done ? 'af-result-done' : ''} ${selected ? 'af-selected' : ''}`}
      style={place(box)}
      aria-label="Итог прогона"
    >
      <span className="af-result-title">Итог</span>
      {rows.map(([label, value]) => (
        <span key={label} className="af-result-row">
          <span>{label}</span>
          <b>{value}</b>
        </span>
      ))}
      <span className="af-result-row">
        <span>покрытие</span>
        <b className={done ? 'text-brand' : ''}>{view.coverage ? `${Math.round(view.coverage.coverage_percent)}%` : '—'}</b>
      </span>
      <span className={`af-result-state ${done ? 'text-brand' : view.status === 'failed' ? 'text-hazard' : 'text-fg-dim'}`}>
        {done ? 'готово' : view.status === 'failed' ? 'сбой' : 'собирается'}
      </span>
    </button>
  )
}
