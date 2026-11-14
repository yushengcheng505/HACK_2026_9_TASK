import { ROSTER } from '@/entities/agent'
import type { RunPhase } from '@/features/team-run'
import { PhaseSteps } from './PhaseSteps'

interface StageToolbarProps {
  phase: RunPhase
}

export function StageToolbar({ phase }: StageToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3.5 px-1.5 pt-1 pb-[18px]">
      <div className="flex items-center gap-2.5 font-mono text-[13px] text-fg-muted">
        <span className="fx-live inline-block size-[9px] rounded-full bg-brand" aria-hidden="true" />
        <span className="font-bold text-brand">В ЭФИРЕ</span>
        <span>· NAPS и {ROSTER.length} агентов</span>
      </div>
      <PhaseSteps phase={phase} />
    </div>
  )
}
