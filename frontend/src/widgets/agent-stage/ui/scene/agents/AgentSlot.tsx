import type { AgentRunState } from '@/features/team-run'
import { palette } from '@/shared/config/palette'
import { AGENT_SCALE, AGENT_SLOTS, BOT_BODY_CENTER_Y, CAPTION } from '../../../model/layout'
import { AgentCaption } from './AgentCaption'
import { AGENT_BOTS } from './agentBots'
import { EXPRESSION_BY_STATUS } from './expression'

interface AgentSlotProps {
  state: AgentRunState
}

/** Агент на сцене: тень, уменьшенный робот (с анимацией по статусу) и подпись с чипом статуса. */
export function AgentSlot({ state }: AgentSlotProps) {
  const slot = AGENT_SLOTS[state.agent.id]
  const Bot = AGENT_BOTS[state.agent.id]
  const working = state.status === 'working'

  return (
    <g transform={`translate(${slot.cx} ${slot.bodyY})`} data-agent={state.agent.id}>
      <ellipse cx="0" cy={CAPTION.shadowY} rx="40" ry="5" fill={palette.shadow} opacity="0.45" />
      <g
        className={working ? 'fx-bob' : 'fx-float'}
        opacity={state.status === 'waiting' ? 0.6 : 1}
        style={{ animationDelay: slot.motionDelay }}
      >
        <g transform={`scale(${AGENT_SCALE}) translate(0 ${-BOT_BODY_CENTER_Y})`}>
          <Bot expression={EXPRESSION_BY_STATUS[state.status]} active={working} blinkDelay={slot.blinkDelay} />
        </g>
      </g>
      <AgentCaption state={state} />
    </g>
  )
}
