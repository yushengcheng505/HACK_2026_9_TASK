import { useMemo } from 'react'
import type { RunView } from '@/entities/run'
import { useCountUp } from '@/shared/lib/useCountUp'
import { stagesOf } from '../model/stages'
import type { Stage, StageId } from '../model/stages'
import '../progress.css'

interface RunProgressProps {
  view: RunView
  selected: StageId | null
  onSelect: (id: StageId) => void
}

function Value({ stage, done }: { stage: Stage; done: boolean }) {
  const shown = useCountUp(stage.value ?? 0)
  if (stage.id === 'result') {
    return <span className={`rp-value ${done ? 'text-brand' : 'text-fg-dim'}`}>{done ? '✓' : '—'}<span className="rp-unit">{stage.unit}</span></span>
  }
  return (
    <span className="rp-value">
      {stage.value === null ? <span className="text-fg-dim">—</span> : Math.round(shown)}
      {stage.value !== null && stage.suffix && <span className="rp-suffix">{stage.suffix}</span>}
      <span className="rp-unit">{stage.unit}</span>
    </span>
  )
}

/** Ход прогона: шесть этапов конвейера с главным числом каждого; подробности — при наведении и в инспекторе. */
export function RunProgress({ view, selected, onSelect }: RunProgressProps) {
  const stages = useMemo(() => stagesOf(view), [view])
  const reached = stages.reduce((last, s, i) => (s.phase !== 'idle' ? i : last), 0)
  const fill = view.status === 'done' ? 1 : reached / (stages.length - 1)
  const loopActive = view.activeNode === 'tasks' && view.nodes.tasks.visits > 1

  return (
    <section className="rp" aria-label="Ход прогона">
      <div className="rp-track">
        <span className="rp-rail" aria-hidden="true">
          <i style={{ transform: `scaleX(${fill})` }} />
        </span>
        {view.criticRound > 0 && (
          <span className={`rp-loop ${loopActive ? 'rp-loop-active' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 100 16" preserveAspectRatio="none">
              <path d="M 100 16 C 100 3, 0 3, 0 16" vectorEffect="non-scaling-stroke" />
            </svg>
            <b>↺ доработка · круг {view.criticRound}</b>
          </span>
        )}
        <ol className="rp-grid">
        {stages.map((s) => (
          <li key={s.id} className="rp-cell">
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              aria-pressed={selected === s.id}
              className={`rp-tile rp-${s.phase} ${selected === s.id ? 'rp-selected' : ''}`}
            >
              <span className="rp-head">
                <i className="rp-dot" />
                <span className="rp-label">{s.label}</span>
                {s.badge && <span className={`rp-badge rp-tone-${s.badge.tone}`}>{s.badge.text}</span>}
              </span>
              <Value stage={s} done={view.status === 'done'} />
              <span className="rp-pop" role="tooltip">
                {s.rows.map(([k, v]) => (
                  <span key={k} className="rp-row">
                    <span>{k}</span>
                    <b>{v}</b>
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
        </ol>
      </div>
    </section>
  )
}
