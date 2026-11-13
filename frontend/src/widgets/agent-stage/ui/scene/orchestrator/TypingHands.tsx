import { palette } from '@/shared/config/palette'
import type { HandPose, HandsPose } from '../../../model/computeHands'

interface HandProps {
  pose: HandPose
  side: 'left' | 'right'
}

function Hand({ pose, side }: HandProps) {
  return (
    <g transform={`translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)})`}>
      <rect x="-9" y="-8" width="18" height="12" rx="6" fill={palette.brand} />
      <rect x="-3" y="1" width="6" height="8" rx="3" fill={palette.brand} />
      <rect x={side === 'left' ? -6 : 2} y="-4" width="4" height="2" rx="1" fill={palette.brandDeep} opacity="0.6" />
    </g>
  )
}

interface TypingHandsProps {
  hands: HandsPose
}

export function TypingHands({ hands }: TypingHandsProps) {
  return (
    <>
      <path d={hands.left.armPath} fill="none" stroke={palette.brand} className="pen-5" />
      <path d={hands.right.armPath} fill="none" stroke={palette.brand} className="pen-5" />
      <Hand pose={hands.left} side="left" />
      <Hand pose={hands.right} side="right" />
    </>
  )
}
