import type { AgentRunState, AgentStatus } from '@/features/team-run'
import { palette } from '@/shared/config/palette'

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

const CHIP = { width: 100, height: 26, y: 322 } as const

interface AgentCaptionProps {
  state: AgentRunState
}

export function AgentCaption({ state }: AgentCaptionProps) {
  const look = CHIP_LOOK[state.status]
  return (
    <>
      <text x="0" y="292" className="scene-label">
        {state.agent.name}
      </text>
      <text x="0" y="311" className="scene-role">
        {state.agent.role}
      </text>
      <rect
        x={-CHIP.width / 2}
        y={CHIP.y}
        width={CHIP.width}
        height={CHIP.height}
        rx={CHIP.height / 2}
        fill={look.fill}
        stroke={look.stroke}
        className="pen-15"
      />
      <text x="0" y="339" className="scene-chip" fill={look.ink}>
        {chipText(state)}
      </text>
    </>
  )
}
