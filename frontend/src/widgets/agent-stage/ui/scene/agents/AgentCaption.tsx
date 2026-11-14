import type { AgentRunState, AgentStatus } from '@/features/team-run'
import { palette } from '@/shared/config/palette'
import { CAPTION } from '../../../model/layout'

interface ChipLook {
  fill: string
  stroke: string
  ink: string
}

const CHIP_LOOK: Record<AgentStatus, ChipLook> = {
  waiting: { fill: palette.ink, stroke: palette.lineMuted, ink: palette.fgDim },
  working: { fill: palette.brandDeep, stroke: palette.brand, ink: palette.fg },
  done: { fill: palette.brand, stroke: palette.brand, ink: palette.ink },
}

function chipText({ status, receiving }: AgentRunState) {
  if (status === 'working') return 'работает…'
  if (status === 'done') return 'готово'
  return receiving ? 'получает…' : 'ждёт'
}

interface AgentCaptionProps {
  state: AgentRunState
}

/** Подпись в координатах слота: (0, 0) — центр корпуса робота. */
export function AgentCaption({ state }: AgentCaptionProps) {
  const look = CHIP_LOOK[state.status]
  return (
    <>
      <text x="0" y={CAPTION.nameY} className="scene-label scene-label--agent">
        {state.agent.name}
      </text>
      <text x="0" y={CAPTION.focusY} className="scene-role">
        {state.agent.focus}
      </text>
      <rect
        x={-CAPTION.chipWidth / 2}
        y={CAPTION.chipY}
        width={CAPTION.chipWidth}
        height={CAPTION.chipHeight}
        rx={CAPTION.chipHeight / 2}
        fill={look.fill}
        stroke={look.stroke}
        className="pen-15"
      />
      <text x="0" y={CAPTION.chipY + 15} className="scene-chip" fill={look.ink}>
        {chipText(state)}
      </text>
    </>
  )
}
