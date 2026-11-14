import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

const BRISTLES = [-10, -3, 4, 11] as const
const DUST = [
  { x: -18, delay: 0 },
  { x: 6, delay: 0.35 },
  { x: 20, delay: 0.7 },
] as const

/**
 * Упрощатель: метла сбоку.
 * Без дела метла стоит, прислонённая к корпусу, и изредка чуть шаркает;
 * в работе он метёт — метла ходит из стороны в сторону, из-под прутьев летит пыль лишней работы.
 */
export function SimplifierBot({ expression, active, blinkDelay }: BotProps) {
  return (
    <>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.keyCap} stroke={palette.brand} className="pen-2" />
      <AgentFace expression={expression} ink={palette.brand} blinkDelay={blinkDelay} />
      <g transform="translate(76 148) rotate(-12)">
        <g className={active ? 'fx-sweep' : 'fx-sweep-idle'} style={{ transformOrigin: '0px 0px' }}>
          <line x1="0" y1="0" x2="0" y2="80" stroke={palette.fgDim} className="pen-5" />
          <rect x="-11" y="78" width="22" height="9" rx="2.5" fill={palette.brandDeep} />
          <path d="M-11 87 L11 87 L18 112 L-18 112 Z" fill={palette.brand} />
          {BRISTLES.map((x) => (
            <line key={x} x1={x} y1="91" x2={x * 1.45} y2="110" stroke={palette.brandDeep} className="pen-15" />
          ))}
          {active &&
            DUST.map((dust) => (
              <circle
                key={dust.x}
                cx={dust.x}
                cy="112"
                r="3.5"
                fill={palette.fgDim}
                className="fx-dust"
                style={{ animationDelay: `${dust.delay}s` }}
              />
            ))}
        </g>
      </g>
    </>
  )
}
