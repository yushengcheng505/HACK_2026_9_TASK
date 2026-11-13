import type { ReactNode } from 'react'
import { ExpressionLayer } from '../ExpressionLayer'
import type { Expression } from './expression'

const EYE_X = { left: -29, right: 15 } as const

interface AgentFaceProps {
  expression: Expression
  ink: string
  blinkDelay: string
  /** Верхний край открытых глаз. */
  eyeY?: number
  /** Своя форма «сосредоточенных» глаз вместо прищура. */
  focusedEyes?: ReactNode
}

export function AgentFace({ expression, ink, blinkDelay, eyeY = 183, focusedEyes }: AgentFaceProps) {
  const smileBase = eyeY + 19
  const smileTop = eyeY + 5

  return (
    <>
      <ExpressionLayer visible={expression === 'neutral'}>
        {[EYE_X.left, EYE_X.right].map((x) => (
          <rect
            key={x}
            className="fx-blink"
            x={x}
            y={eyeY}
            width="14"
            height="24"
            rx="5"
            fill={ink}
            style={{ animationDelay: blinkDelay }}
          />
        ))}
      </ExpressionLayer>
      <ExpressionLayer visible={expression === 'focused'}>
        {focusedEyes ?? (
          <>
            <rect x={EYE_X.left - 1} y={eyeY + 11} width="16" height="6" rx="3" fill={ink} />
            <rect x={EYE_X.right - 1} y={eyeY + 11} width="16" height="6" rx="3" fill={ink} />
          </>
        )}
      </ExpressionLayer>
      <ExpressionLayer visible={expression === 'happy'}>
        <path d={`M-30 ${smileBase} Q-22 ${smileTop} -14 ${smileBase}`} fill="none" stroke={ink} className="pen-4" />
        <path d={`M14 ${smileBase} Q22 ${smileTop} 30 ${smileBase}`} fill="none" stroke={ink} className="pen-4" />
      </ExpressionLayer>
    </>
  )
}
