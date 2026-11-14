import type { OrchestratorMood } from '@/features/team-run'
import { palette } from '@/shared/config/palette'
import { ExpressionLayer } from '../ExpressionLayer'

interface OrchestratorBotProps {
  mood: OrchestratorMood
}

/** Корпус NAPS в абсолютных координатах сцены (центр — x = 200). */
export function OrchestratorBot({ mood }: OrchestratorBotProps) {
  return (
    <g className={mood === 'typing' ? undefined : 'fx-float'}>
      <line x1="200" y1="120" x2="200" y2="96" stroke={palette.brand} className="pen-3" />
      <circle cx="200" cy="89" r="8" fill={mood === 'typing' ? palette.fg : palette.brand} className="fx-led" />
      <rect x="110" y="120" width="180" height="132" rx="32" fill={palette.brand} />
      <rect x="124" y="134" width="152" height="104" rx="22" fill={palette.brandGlow} opacity="0.45" />

      <ExpressionLayer visible={mood === 'idle'}>
        <rect className="fx-blink" x="161" y="160" width="22" height="38" rx="7" fill={palette.ink} />
        <rect className="fx-blink" x="217" y="160" width="22" height="38" rx="7" fill={palette.ink} />
      </ExpressionLayer>
      <ExpressionLayer visible={mood === 'typing'}>
        <rect x="161" y="180" width="22" height="24" rx="7" fill={palette.ink} />
        <rect x="217" y="180" width="22" height="24" rx="7" fill={palette.ink} />
      </ExpressionLayer>
      <ExpressionLayer visible={mood === 'done'}>
        <path d="M160 190 Q172 170 184 190" fill="none" stroke={palette.ink} className="pen-5" />
        <path d="M216 190 Q228 170 240 190" fill="none" stroke={palette.ink} className="pen-5" />
      </ExpressionLayer>

      <circle cx="270" cy="236" r="3.5" fill={palette.ink} opacity="0.45" />
      <rect x="186" y="252" width="28" height="14" fill={palette.brandDeep} />
    </g>
  )
}
