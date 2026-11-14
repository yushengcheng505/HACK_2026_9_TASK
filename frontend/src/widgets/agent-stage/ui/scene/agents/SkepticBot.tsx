import { palette } from '@/shared/config/palette'
import { ExpressionLayer } from '../ExpressionLayer'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

/**
 * Скептик: приподнятая бровь и значок сомнения.
 * Без дела бровь изредка дёргается, «?» еле виден; в работе он мотает головой,
 * бровь ходит вверх-вниз, а «?» сменяется «✕» — ложная находка отсеяна.
 */
export function SkepticBot({ expression, active, blinkDelay }: BotProps) {
  return (
    <g className={active ? 'fx-doubt-shake' : undefined} style={{ transformOrigin: '0px 250px' }}>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.fgDim} />
      <AgentFace expression={expression} ink={palette.ink} blinkDelay={blinkDelay} />
      <path
        d="M-35 171 Q-23 159 -11 166"
        fill="none"
        stroke={palette.ink}
        className={active ? 'pen-4 fx-brow' : 'pen-4 fx-brow-idle'}
      />
      <ExpressionLayer visible={expression !== 'happy'}>
        <path d="M-12 232 L14 227" fill="none" stroke={palette.ink} className="pen-3" />
      </ExpressionLayer>
      <g className={active ? undefined : 'doubt-idle'}>
        <circle cx="52" cy="134" r="16" fill={palette.ink} stroke={palette.brand} className="pen-2" />
        <text x="52" y="142" className={active ? 'scene-badge fx-alt-a' : 'scene-badge'} fill={palette.brand}>
          ?
        </text>
        <text x="52" y="141" className={active ? 'scene-badge fx-alt-b' : 'scene-badge fx-hidden'} fill={palette.fg}>
          ✕
        </text>
      </g>
    </g>
  )
}
