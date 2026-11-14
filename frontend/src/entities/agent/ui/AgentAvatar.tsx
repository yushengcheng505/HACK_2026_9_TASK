import type { ReactNode } from 'react'
import { palette } from '@/shared/config/palette'
import type { AgentId } from '../model/types'

interface HeadProps {
  fill: string
  stroke?: string
}

const Head = ({ fill, stroke }: HeadProps) => (
  <rect x="8" y="12" width="32" height="26" rx="8" fill={fill} stroke={stroke} strokeWidth={stroke ? 1.6 : 0} />
)

interface EyesProps {
  ink: string
  /** Правый глаз прищурен — у Скептика. */
  squint?: boolean
}

const Eyes = ({ ink, squint }: EyesProps) => (
  <>
    <rect x="15.5" y="21" width="4.5" height="9" rx="2" fill={ink} />
    {squint ? (
      <rect x="28" y="24.5" width="5" height="2.6" rx="1.3" fill={ink} />
    ) : (
      <rect x="28" y="21" width="4.5" height="9" rx="2" fill={ink} />
    )}
  </>
)

const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Маленькие версии роботов со сцены: голова и главный атрибут каждого. */
const MINIS: Record<AgentId, ReactNode> = {
  requirements: (
    <>
      <line x1="24" y1="12" x2="24" y2="6.5" stroke={palette.brand} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="24" cy="4.8" r="2.4" fill={palette.brand} />
      <path d="M28 2.4 Q30.6 4.8 28 7.2" stroke={palette.brand} strokeWidth="1.3" {...line} />
      <path d="M30.8 0.8 Q35 4.8 30.8 8.8" stroke={palette.brand} strokeWidth="1.3" {...line} />
      <Head fill={palette.brandDeep} stroke={palette.brandMid} />
      <Eyes ink={palette.brand} />
    </>
  ),
  analyst: (
    <>
      <Head fill={palette.brand} />
      <Eyes ink={palette.ink} />
      <circle cx="30.2" cy="25.5" r="6" stroke={palette.ink} strokeWidth="1.7" fill="none" />
      <path d="M36 27 Q39.5 32.5 35.5 37" stroke={palette.brandDeep} strokeWidth="1.3" {...line} />
    </>
  ),
  stories: (
    <>
      <g transform="rotate(32 40.5 21)">
        <rect x="38.8" y="12" width="3.4" height="14" rx="0.8" fill={palette.brand} />
        <path d="M38.8 26 L40.5 29.5 L42.2 26 Z" fill={palette.fg} />
      </g>
      <Head fill={palette.mint} />
      <ellipse cx="22" cy="13" rx="13" ry="4" fill={palette.brandDeep} transform="rotate(-9 22 13)" />
      <circle cx="19.5" cy="8.6" r="1.8" fill={palette.brandDeep} />
      <Eyes ink={palette.ink} />
    </>
  ),
  tasks: (
    <>
      <path d="M5.5 26 C5.5 5 42.5 5 42.5 26" stroke={palette.brandDeep} strokeWidth="3" {...line} />
      <Head fill={palette.ink} stroke={palette.brand} />
      <rect x="3" y="20.5" width="5.5" height="11" rx="2.2" fill={palette.brand} />
      <rect x="39.5" y="20.5" width="5.5" height="11" rx="2.2" fill={palette.brand} />
      <path d="M15.5 21.5 L19.5 25 L15.5 28.5" stroke={palette.brand} strokeWidth="1.8" {...line} />
      <path d="M32.5 21.5 L28.5 25 L32.5 28.5" stroke={palette.brand} strokeWidth="1.8" {...line} />
    </>
  ),
  reviewer: (
    <>
      <Head fill={palette.brandMid} />
      <Eyes ink={palette.fg} />
      <rect x="33.5" y="23.5" width="12.5" height="15" rx="2" fill={palette.keyCap} stroke={palette.brand} strokeWidth="1.2" />
      <rect x="36.8" y="21.8" width="6" height="3.2" rx="1" fill={palette.brand} />
      <path d="M36.4 31 L38.8 33.4 L43.2 28.4" stroke={palette.brand} strokeWidth="1.6" {...line} />
    </>
  ),
  junction: (
    <>
      <rect x="11" y="2.5" width="11" height="8" rx="1.6" fill={palette.brand} />
      <circle cx="22.6" cy="6.5" r="2.4" fill={palette.brand} />
      <rect x="25" y="2.5" width="11" height="8" rx="1.6" fill={palette.mint} />
      <Head fill={palette.ink} stroke={palette.mint} />
      <Eyes ink={palette.mint} />
    </>
  ),
  simplifier: (
    <>
      <Head fill={palette.keyCap} stroke={palette.brand} />
      <Eyes ink={palette.brand} />
      <path d="M38.5 11.5 L42 28" stroke={palette.fgDim} strokeWidth="2" {...line} />
      <rect x="38.4" y="27" width="7.2" height="2.8" rx="1" fill={palette.brandDeep} />
      <path d="M38.6 29.6 L45.4 29.6 L47.6 38.6 L36.4 38.6 Z" fill={palette.brand} />
      <path d="M40.2 31.5 L39.4 37 M42 31.5 L42 37 M43.8 31.5 L44.6 37" stroke={palette.brandDeep} strokeWidth="0.8" {...line} />
    </>
  ),
  skeptic: (
    <>
      <Head fill={palette.fgDim} />
      <Eyes ink={palette.ink} squint />
      <path d="M14 18.5 Q18 15.5 22 17" stroke={palette.ink} strokeWidth="1.7" {...line} />
      <path d="M27 21.5 L33.5 19" stroke={palette.ink} strokeWidth="1.7" {...line} />
      <text x="42" y="11" textAnchor="middle" fontFamily="Unbounded, sans-serif" fontWeight="700" fontSize="11" fill={palette.brand}>
        ?
      </text>
    </>
  ),
}

interface AgentAvatarProps {
  id: AgentId
  /** Ширина в пикселях; высота — по пропорции 48 × 40. */
  size?: number
}

export function AgentAvatar({ id, size = 40 }: AgentAvatarProps) {
  return (
    <svg width={size} height={(size * 40) / 48} viewBox="0 0 48 40" aria-hidden="true" className="shrink-0">
      {MINIS[id]}
    </svg>
  )
}
