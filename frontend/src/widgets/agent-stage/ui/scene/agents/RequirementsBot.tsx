import { palette } from '@/shared/config/palette'
import { AgentFace } from './AgentFace'
import type { BotProps } from './expression'

const SHEET_LINES = [
  { y: 188, width: 26 },
  { y: 198, width: 22 },
  { y: 208, width: 26 },
  { y: 218, width: 16 },
] as const

/**
 * Составитель требований: антенна-радар и лист эпика в руке.
 * Без дела антенна медленно покачивается; в работе радар пульсирует, антенна сканирует,
 * а строки листа по очереди вспыхивают — он «вытаскивает» из них требования.
 */
export function RequirementsBot({ expression, active, blinkDelay }: BotProps) {
  return (
    <>
      <g className={active ? 'fx-antenna-scan' : 'fx-antenna-sway'} style={{ transformOrigin: '0px 150px' }}>
        <line x1="0" y1="150" x2="0" y2="130" stroke={palette.brand} className="pen-3" />
        <circle cx="0" cy="124" r="6" fill={palette.brand} className={active ? 'fx-led' : undefined} />
        <g className={active ? 'fx-radar' : 'fx-radar-idle'}>
          <path d="M10 116 Q18 124 10 132" fill="none" stroke={palette.brand} className="pen-3" />
          <path d="M17 109 Q31 124 17 139" fill="none" stroke={palette.brand} className="pen-3" />
        </g>
      </g>
      <g transform="rotate(-9 -80 200)">
        <rect x="-99" y="176" width="38" height="52" rx="5" fill={palette.fg} />
        {SHEET_LINES.map((line, index) => (
          <line
            key={line.y}
            x1={-93}
            y1={line.y}
            x2={-93 + line.width}
            y2={line.y}
            className={active ? 'pen-3 fx-extract' : 'pen-3 sheet-line'}
            style={{ animationDelay: `${index * 0.45}s` }}
          />
        ))}
      </g>
      <rect x="-60" y="150" width="120" height="100" rx="26" fill={palette.brandDeep} stroke={palette.brandMid} className="pen-2" />
      <AgentFace expression={expression} ink={palette.brand} blinkDelay={blinkDelay} />
    </>
  )
}
