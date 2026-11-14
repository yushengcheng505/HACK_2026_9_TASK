import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

/**
 * Упрощатель: ножницы сбоку.
 * Без дела ножницы сомкнуты и изредка приоткрываются; в работе он режет —
 * лезвия щёлкают, и от кончиков отлетают обрезки лишней работы.
 */
export function SimplifierBot({ expression, active, blinkDelay }: BotProps) {
  return (
    <>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.keyCap} stroke={palette.brand} className="pen-2" />
      <AgentFace expression={expression} ink={palette.brand} blinkDelay={blinkDelay} />
      <path d="M-16 229 L16 229" fill="none" stroke={palette.brand} className="pen-3" opacity="0.7" />
      <g transform="translate(84 216) rotate(26)">
        <g className={active ? 'fx-snip-a' : 'fx-snip-idle-a'} style={{ transformOrigin: '0px 0px' }}>
          <path d="M-7 21 L11 -33" fill="none" stroke={palette.fg} className="pen-5" />
          <circle cx="-9" cy="28" r="7" fill={palette.keyCap} stroke={palette.brand} className="pen-3" />
        </g>
        <g className={active ? 'fx-snip-b' : 'fx-snip-idle-b'} style={{ transformOrigin: '0px 0px' }}>
          <path d="M7 21 L-11 -33" fill="none" stroke={palette.fg} className="pen-5" />
          <circle cx="9" cy="28" r="7" fill={palette.keyCap} stroke={palette.brand} className="pen-3" />
        </g>
        <circle cx="0" cy="0" r="3.5" fill={palette.brand} />
        {active &&
          [0, 0.5].map((delay) => (
            <rect
              key={delay}
              x="-4"
              y="-40"
              width="9"
              height="4"
              rx="1.5"
              fill={palette.brand}
              className="fx-crumb"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
      </g>
    </>
  )
}
