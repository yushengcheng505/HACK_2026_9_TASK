import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

const EYE_Y = 180
const TICKETS = [-44, -12, 20] as const

/**
 * Генератор задач: наушники.
 * Без дела наушники еле заметно пульсируют; в работе качают в такт,
 * а из головы одна за другой вылетают карточки задач.
 */
export function TasksBot({ expression, active, blinkDelay }: BotProps) {
  return (
    <>
      {active &&
        TICKETS.map((x, index) => (
          <g key={x} className="fx-ticket" style={{ animationDelay: `${index * 0.45}s` }}>
            <rect x={x} y="122" width="26" height="17" rx="3" fill={palette.fg} />
            <line x1={x + 5} y1="128" x2={x + 20} y2="128" stroke={palette.brandDeep} className="pen-3" />
            <line x1={x + 5} y1="134" x2={x + 14} y2="134" stroke={palette.brand} className="pen-3" />
          </g>
        ))}
      <path d="M-68 196 C-68 118 68 118 68 196" fill="none" stroke={palette.brandDeep} className="pen-8" />
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.ink} stroke={palette.brand} className="pen-2" />
      <g className={active ? 'fx-beat' : 'fx-beat-idle'}>
        <rect x="-76" y="180" width="16" height="36" rx="7" fill={palette.brand} />
      </g>
      <g className={active ? 'fx-beat' : 'fx-beat-idle'}>
        <rect x="60" y="180" width="16" height="36" rx="7" fill={palette.brand} />
      </g>
      <AgentFace
        expression={expression}
        ink={palette.brand}
        blinkDelay={blinkDelay}
        eyeY={EYE_Y}
        focusedEyes={
          <>
            <path d="M-28 184 L-16 192 L-28 200" fill="none" stroke={palette.brand} className="pen-4" />
            <path d="M28 184 L16 192 L28 200" fill="none" stroke={palette.brand} className="pen-4" />
          </>
        }
      />
    </>
  )
}
