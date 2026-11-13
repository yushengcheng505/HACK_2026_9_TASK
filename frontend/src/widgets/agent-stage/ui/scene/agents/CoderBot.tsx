import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

const EYE_Y = 180

/** Бит: наушники и глаза-скобки «> <» во время работы. */
export function CoderBot({ expression, blinkDelay }: BotProps) {
  return (
    <>
      <path d="M-68 196 C-68 118 68 118 68 196" fill="none" stroke={palette.brandDeep} className="pen-8" />
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.ink} stroke={palette.brand} className="pen-2" />
      <rect x="-76" y="180" width="16" height="36" rx="7" fill={palette.brand} />
      <rect x="60" y="180" width="16" height="36" rx="7" fill={palette.brand} />
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
      <text x="0" y="236" className="scene-code" fill={palette.brandMid}>
        {'</>'}
      </text>
    </>
  )
}
