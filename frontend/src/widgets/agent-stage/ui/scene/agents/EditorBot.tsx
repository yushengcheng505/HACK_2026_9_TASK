import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

/** Перо: берет и карандаш за ухом. */
export function EditorBot({ expression, blinkDelay }: BotProps) {
  return (
    <>
      <g transform="rotate(32 69 182)">
        <rect x="64" y="150" width="10" height="48" rx="2" fill={palette.brand} />
        <rect x="64" y="150" width="10" height="9" rx="2" fill={palette.brandDeep} />
        <path d="M64 198 L69 209 L74 198 Z" fill={palette.fg} />
      </g>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.mint} />
      <ellipse cx="-15" cy="153" rx="48" ry="13" fill={palette.brandDeep} transform="rotate(-9 -15 153)" />
      <circle cx="-23" cy="139" r="5.5" fill={palette.brandDeep} />
      <AgentFace expression={expression} ink={palette.ink} blinkDelay={blinkDelay} />
      <circle cx="-39" cy="222" r="4" fill={palette.brand} />
      <circle cx="39" cy="222" r="4" fill={palette.brand} />
    </>
  )
}
