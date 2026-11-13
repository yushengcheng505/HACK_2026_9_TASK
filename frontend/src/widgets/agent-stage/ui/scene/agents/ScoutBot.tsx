import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

/** Ищейка: антенна с радаром. */
export function ScoutBot({ expression, active, blinkDelay }: BotProps) {
  return (
    <>
      <line x1="0" y1="150" x2="0" y2="130" stroke={palette.brand} className="pen-3" />
      <circle cx="0" cy="124" r="6" fill={palette.brand} />
      <g className={active ? 'fx-radar' : 'fx-radar-idle'}>
        <path d="M10 116 Q18 124 10 132" fill="none" stroke={palette.brand} className="pen-3" />
        <path d="M17 109 Q31 124 17 139" fill="none" stroke={palette.brand} className="pen-3" />
      </g>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.brandDeep} stroke={palette.brandMid} className="pen-2" />
      <AgentFace expression={expression} ink={palette.brand} blinkDelay={blinkDelay} />
    </>
  )
}
