import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

const ROWS = [208, 222, 236] as const

/**
 * Рецензент: планшет с чек-листом своей истории.
 * Без дела планшет слегка покачивается; в работе приподнят, и галочки
 * ставятся по одной. Когда проверка закончена, все галочки стоят.
 */
export function ReviewerBot({ expression, active, blinkDelay }: BotProps) {
  const checked = expression === 'happy'
  return (
    <>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.brandMid} />
      <AgentFace expression={expression} ink={palette.fg} blinkDelay={blinkDelay} />
      <g className={active ? 'fx-board-work' : 'fx-board-idle'} style={{ transformOrigin: '58px 252px' }}>
        <rect x="34" y="192" width="48" height="60" rx="6" fill={palette.keyCap} stroke={palette.brand} className="pen-2" />
        <rect x="48" y="186" width="20" height="11" rx="3" fill={palette.brand} />
        {ROWS.map((y, index) => (
          <g key={y}>
            <rect x="40" y={y - 5} width="10" height="10" rx="2" fill="none" stroke={palette.brand} className="pen-15" />
            <path
              d={`M41 ${y} L44.5 ${y + 3.5} L51 ${y - 4}`}
              fill="none"
              stroke={palette.brand}
              pathLength={1}
              className={active ? 'pen-3 fx-check' : 'pen-3 check-mark'}
              style={{ animationDelay: `${index * 0.6}s`, strokeDashoffset: active ? undefined : checked ? 0 : 1 }}
            />
            <line x1="56" y1={y} x2={index === 1 ? 68 : 75} y2={y} stroke={palette.fgDim} className="pen-3" />
          </g>
        ))}
      </g>
    </>
  )
}
