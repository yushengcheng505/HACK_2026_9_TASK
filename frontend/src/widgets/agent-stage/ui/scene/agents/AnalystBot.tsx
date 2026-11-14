import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

/**
 * Аналитик: монокль. Без дела на стекле изредка пробегает блик;
 * в работе монокль ездит от глаза к глазу, а над головой вспыхивает «!» — найден пробел.
 */
export function AnalystBot({ expression, active, blinkDelay }: BotProps) {
  return (
    <>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.brand} />
      <AgentFace expression={expression} ink={palette.ink} blinkDelay={blinkDelay} />
      <g className={active ? 'fx-monocle-scan' : undefined}>
        <circle cx="22" cy="195" r="19" fill="none" stroke={palette.ink} className="pen-3" />
        <path d="M9 188 Q12 180 21 179" fill="none" stroke={palette.fg} className={active ? 'pen-3' : 'pen-3 fx-glint'} opacity={active ? 0.7 : undefined} />
        <path d="M41 198 Q57 226 37 246" fill="none" stroke={palette.brandDeep} className="pen-2" />
      </g>
      <g className={active ? 'fx-alert' : 'fx-hidden'}>
        <circle cx="50" cy="136" r="15" fill={palette.ink} stroke={palette.brand} className="pen-2" />
        <text x="50" y="143.5" className="scene-badge" fill={palette.brand}>
          !
        </text>
      </g>
    </>
  )
}
