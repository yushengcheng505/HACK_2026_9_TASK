import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

const STORY_LINES = [
  { y: 141, width: 34 },
  { y: 150, width: 28 },
  { y: 159, width: 20 },
] as const

/**
 * Автор историй: берет и карандаш за ухом.
 * Без дела постукивает карандашом; в работе быстро пишет, а рядом в облачке
 * строка за строкой появляется история «Как пользователь, я хочу…».
 */
export function StoriesBot({ expression, active, blinkDelay }: BotProps) {
  return (
    <>
      <g className={active ? 'fx-scribble' : 'fx-pencil-tap'} style={{ transformOrigin: '69px 196px' }}>
        <g transform="rotate(32 69 182)">
          <rect x="64" y="150" width="10" height="48" rx="2" fill={palette.brand} />
          <rect x="64" y="150" width="10" height="9" rx="2" fill={palette.brandDeep} />
          <path d="M64 198 L69 209 L74 198 Z" fill={palette.fg} />
        </g>
      </g>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.mint} />
      <ellipse cx="-15" cy="153" rx="48" ry="13" fill={palette.brandDeep} transform="rotate(-9 -15 153)" />
      <circle cx="-23" cy="139" r="5.5" fill={palette.brandDeep} />
      <AgentFace expression={expression} ink={palette.ink} blinkDelay={blinkDelay} />
      <circle cx="-39" cy="222" r="4" fill={palette.brand} />
      <circle cx="39" cy="222" r="4" fill={palette.brand} />
      <g className={active ? 'fx-bubble-in' : 'fx-hidden'}>
        <rect x="-112" y="128" width="50" height="40" rx="10" fill={palette.fg} />
        <path d="M-74 166 L-64 180 L-84 166 Z" fill={palette.fg} />
        {STORY_LINES.map((line, index) => (
          <line
            key={line.y}
            x1={-104}
            y1={line.y}
            x2={-104 + line.width}
            y2={line.y}
            stroke={palette.brandDeep}
            className="pen-3 fx-write"
            style={{ animationDelay: `${index * 0.5}s` }}
          />
        ))}
      </g>
    </>
  )
}
