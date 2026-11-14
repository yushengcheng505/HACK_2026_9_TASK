import { AGENTS, TEAM_LABELS, type AgentTeam } from '@/entities/agent'
import { palette } from '@/shared/config/palette'
import { TEAM_ROWS } from '../../model/layout'

const TEAMS = Object.keys(TEAM_ROWS) as AgentTeam[]
const LEFT = 486
const RIGHT = 1160

/** Подписи рядов: «01 · ДЕКОМПОЗИЦИЯ», «02 · ПРОВЕРКА» и тонкая линия до края сцены. */
export function TeamLabels() {
  return (
    <g data-layer="teams">
      {TEAMS.map((team, index) => {
        const { labelY } = TEAM_ROWS[team]
        const count = AGENTS.filter((agent) => agent.team === team).length
        return (
          <g key={team}>
            <text x={LEFT} y={labelY} className="scene-team">
              <tspan fill={palette.brand}>{String(index + 1).padStart(2, '0')}</tspan> · {TEAM_LABELS[team]}
              <tspan fill={palette.fgDim}> · {count}</tspan>
            </text>
            <line x1={LEFT + 210} y1={labelY - 4} x2={RIGHT} y2={labelY - 4} stroke={palette.lineMuted} className="pen-15" strokeDasharray="2 6" />
          </g>
        )
      })}
    </g>
  )
}
