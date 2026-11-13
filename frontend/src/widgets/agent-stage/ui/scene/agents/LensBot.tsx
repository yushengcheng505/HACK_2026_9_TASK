import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

/** Лупа: монокль на правом глазу. */
export function LensBot({ expression, blinkDelay }: BotProps) {
  return (
    <>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.brand} />
      <AgentFace expression={expression} ink={palette.ink} blinkDelay={blinkDelay} />
      <circle cx="22" cy="195" r="19" fill="none" stroke={palette.ink} className="pen-3" />
      <path d="M41 198 Q57 226 37 246" fill="none" stroke={palette.brandDeep} className="pen-2" />
    </>
  )
}
