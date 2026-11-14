import { TEAM_LABELS, type AgentTeam } from '@/entities/agent'
import { palette } from '@/shared/config/palette'
import { AGENT_BOUNDS, TEAM_LABEL_X, TEAM_ROWS } from '../../model/layout'

const TEAMS = Object.keys(TEAM_ROWS) as AgentTeam[]
/** Половина длины подписи вдоль вертикали плюс зазор до линий. */
const TEXT_HALF = 84

/** Подписи рядов слева от роботов, вертикально: «01 · ДЕКОМПОЗИЦИЯ», «02 · ПРОВЕРКА». */
export function TeamLabels() {
  return (
    <g data-layer="teams">
      {TEAMS.map((team, index) => {
        const { bodyY } = TEAM_ROWS[team]
        const top = bodyY - AGENT_BOUNDS.top
        const bottom = bodyY + AGENT_BOUNDS.bottom
        const center = (top + bottom) / 2
        return (
          <g key={team}>
            <text x={TEAM_LABEL_X} y={center} transform={`rotate(-90 ${TEAM_LABEL_X} ${center})`} className="scene-team">
              <tspan fill={palette.brand}>{String(index + 1).padStart(2, '0')}</tspan> · {TEAM_LABELS[team]}
            </text>
            {[
              [top, center - TEXT_HALF],
              [center + TEXT_HALF, bottom],
            ].map(([y1, y2]) => (
              <line
                key={y1}
                x1={TEAM_LABEL_X - 4}
                y1={y1}
                x2={TEAM_LABEL_X - 4}
                y2={y2}
                stroke={palette.lineMuted}
                strokeDasharray="2 6"
                className="pen-15"
              />
            ))}
          </g>
        )
      })}
    </g>
  )
}
