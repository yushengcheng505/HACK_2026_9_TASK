import { PHASE_LABELS, type RunPhase } from '@/features/team-run'

const STEP_LOOK = {
  done: 'border-brand-deep bg-brand-deep text-fg',
  current: 'border-brand bg-brand font-bold text-ink',
  upcoming: 'border-line-muted bg-transparent text-fg-dim',
} as const

const lookFor = (index: number, phase: RunPhase) =>
  index < phase ? STEP_LOOK.done : index === phase ? STEP_LOOK.current : STEP_LOOK.upcoming

interface PhaseStepsProps {
  phase: RunPhase
}

export function PhaseSteps({ phase }: PhaseStepsProps) {
  return (
    <ol className="m-0 flex list-none flex-wrap gap-2 p-0 font-mono text-[12.5px]">
      {PHASE_LABELS.map((label, index) => (
        <li
          key={label}
          className={`rounded-full border px-3 py-[7px] ${lookFor(index, phase)}`}
          aria-current={index === phase ? 'step' : undefined}
        >
          <span className="opacity-70">{String(index + 1).padStart(2, '0')}</span> {label}
        </li>
      ))}
    </ol>
  )
}
