import { AGENT_FIGURE_BOX, AgentFigure } from '@/entities/agent'
import type { AgentRunState } from '@/features/team-run'
import { palette } from '@/shared/config/palette'
import { AGENT_FIGURE_SCALE, AGENT_SLOTS, CAPTION } from '../../../model/layout'
import { AgentCaption } from './AgentCaption'

const [HEAD_X, HEAD_Y] = AGENT_FIGURE_BOX.headCenter

interface AgentSlotProps {
  state: AgentRunState
}

/** Агент на сцене: тень, маленькая модель робота (анимация по статусу) и подпись с чипом статуса. */
export function AgentSlot({ state }: AgentSlotProps) {
  const slot = AGENT_SLOTS[state.agent.id]

  return (
    <g transform={`translate(${slot.cx} ${slot.bodyY})`} data-agent={state.agent.id}>
      <ellipse cx="0" cy={CAPTION.shadowY} rx="40" ry="5" fill={palette.shadow} opacity="0.45" />
      <g opacity={state.status === 'waiting' ? 0.6 : 1}>
        <g transform={`scale(${AGENT_FIGURE_SCALE}) translate(${-HEAD_X} ${-HEAD_Y})`}>
          <AgentFigure id={state.agent.id} state={state.status} />
        </g>
      </g>
      <AgentCaption state={state} />
    </g>
  )
}
