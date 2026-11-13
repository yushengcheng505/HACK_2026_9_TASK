import type { OrchestratorState } from '@/features/team-run'
import { palette } from '@/shared/config/palette'
import { computeHands } from '../../../model/computeHands'
import { Keyboard } from './Keyboard'
import { OrchestratorBot } from './OrchestratorBot'
import { TypingHands } from './TypingHands'

interface OrchestratorProps {
  state: OrchestratorState
  time: number
}

export function Orchestrator({ state, time }: OrchestratorProps) {
  const hands = computeHands(time, state.mood === 'typing')

  return (
    <g data-agent="orchestrator">
      <ellipse cx="200" cy="312" rx="122" ry="9" fill={palette.shadow} opacity="0.45" />
      <OrchestratorBot mood={state.mood} />
      <Keyboard pressedKey={hands.pressedKey} />
      <TypingHands hands={hands} />
      <text x="200" y="334" className="scene-label scene-label--big">
        Ядро <tspan className="scene-role-inline">· ОРКЕСТРАТОР</tspan>
      </text>
    </g>
  )
}
