import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

/**
 * Редактор стыков: два кусочка пазла над головой — соседние истории.
 * Без дела кусочки висят врозь; в работе он подгоняет их друг к другу,
 * на стыке вспыхивает искра. Когда закончил, пазл собран.
 */
export function JunctionBot({ expression, active, blinkDelay }: BotProps) {
  const joined = expression === 'happy'
  const left = active ? 'fx-join-left' : joined ? 'puzzle-joined-left' : 'puzzle-apart-left'
  const right = active ? 'fx-join-right' : joined ? 'puzzle-joined-right' : 'puzzle-apart-right'
  return (
    <>
      <g className={right}>
        <rect x="8" y="112" width="38" height="28" rx="5" fill={palette.mint} />
        <circle cx="8" cy="126" r="7" fill={palette.ink} />
      </g>
      <g className={left}>
        <rect x="-46" y="112" width="38" height="28" rx="5" fill={palette.brand} />
        <circle cx="-7" cy="126" r="7" fill={palette.brand} />
      </g>
      <circle cx="0" cy="126" r="5" fill={palette.fg} className={active ? 'fx-spark' : 'fx-hidden'} />
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.ink} stroke={palette.mint} className="pen-2" />
      <AgentFace expression={expression} ink={palette.mint} blinkDelay={blinkDelay} />
    </>
  )
}
