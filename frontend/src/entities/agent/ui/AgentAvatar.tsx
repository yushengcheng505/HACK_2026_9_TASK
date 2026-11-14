import type { ReactNode } from 'react'
import { palette } from '@/shared/config/palette'
import { AGENT_FIGURE_BOX } from '../model/figure'
import type { AgentId, AgentState } from '../model/types'
import './avatar.css'

const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

interface HeadProps {
  fill: string
  stroke?: string
}

const Head = ({ fill, stroke }: HeadProps) => (
  <rect x="8" y="12" width="32" height="26" rx="8" fill={fill} stroke={stroke} strokeWidth={stroke ? 1.6 : 0} />
)

const EYE_X = [15.5, 28] as const

interface FaceProps {
  state: AgentState
  ink: string
  blinkDelay: string
  /** Правый глаз прищурен — у Скептика, пока он не убеждён. */
  squint?: boolean
  /** Своя форма «сосредоточенных» глаз вместо прищура. */
  focusedEyes?: ReactNode
}

function Face({ state, ink, blinkDelay, squint, focusedEyes }: FaceProps) {
  if (state === 'working') {
    return (
      focusedEyes ?? (
        <>
          {EYE_X.map((x) => (
            <rect key={x} x={x - 0.5} y="24" width="5.5" height="3" rx="1.5" fill={ink} />
          ))}
        </>
      )
    )
  }

  if (state === 'done') {
    return (
      <>
        {EYE_X.map((x) => (
          <path key={x} d={`M${x - 0.3} 27.5 Q${x + 2.25} 22.5 ${x + 4.8} 27.5`} stroke={ink} strokeWidth="2" {...line} />
        ))}
      </>
    )
  }

  return (
    <>
      <rect className="av-blink" x={EYE_X[0]} y="21" width="4.5" height="9" rx="2" fill={ink} style={{ animationDelay: blinkDelay }} />
      {squint ? (
        <rect x={EYE_X[1]} y="24.5" width="5" height="2.6" rx="1.3" fill={ink} />
      ) : (
        <rect className="av-blink" x={EYE_X[1]} y="21" width="4.5" height="9" rx="2" fill={ink} style={{ animationDelay: blinkDelay }} />
      )}
    </>
  )
}

const DoneBadge = () => (
  <g className="av-pop">
    <circle cx="9" cy="34" r="5.5" fill={palette.brand} stroke={palette.ink} strokeWidth="1.5" />
    <path d="M6.6 34.1 L8.3 35.8 L11.4 32.4" stroke={palette.ink} strokeWidth="1.7" {...line} />
  </g>
)

interface MiniProps {
  state: AgentState
  blinkDelay: string
}

/** Маленькие версии роботов со сцены: голова и главный атрибут каждого. */
const MINIS: Record<AgentId, (props: MiniProps) => ReactNode> = {
  requirements: ({ state, blinkDelay }) => (
    <>
      <line x1="24" y1="12" x2="24" y2="6.5" stroke={palette.brand} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="24" cy="4.8" r="2.4" fill={palette.brand} />
      <g opacity={state === 'waiting' ? 0.35 : 1}>
        <path className={state === 'working' ? 'av-wave' : undefined} d="M28 2.4 Q30.6 4.8 28 7.2" stroke={palette.brand} strokeWidth="1.3" {...line} />
        <path
          className={state === 'working' ? 'av-wave' : undefined}
          style={{ animationDelay: '0.25s' }}
          d="M30.8 0.8 Q35 4.8 30.8 8.8"
          stroke={palette.brand}
          strokeWidth="1.3"
          {...line}
        />
      </g>
      <Head fill={palette.brandDeep} stroke={palette.brandMid} />
      <Face state={state} ink={palette.brand} blinkDelay={blinkDelay} />
    </>
  ),
  analyst: ({ state, blinkDelay }) => (
    <>
      <Head fill={palette.brand} />
      <Face state={state} ink={palette.ink} blinkDelay={blinkDelay} />
      <g className={state === 'working' ? 'av-scan' : undefined}>
        <circle cx="30.2" cy="25.5" r="6" stroke={palette.ink} strokeWidth="1.7" fill="none" />
        <path d="M36 27 Q39.5 32.5 35.5 37" stroke={palette.brandDeep} strokeWidth="1.3" {...line} />
      </g>
    </>
  ),
  stories: ({ state, blinkDelay }) => (
    <>
      <g className={state === 'working' ? 'av-scribble' : undefined} style={{ transformOrigin: '36px 28px' }}>
        <g transform="rotate(32 40.5 21)">
          <rect x="38.8" y="12" width="3.4" height="14" rx="0.8" fill={palette.brand} />
          <path d="M38.8 26 L40.5 29.5 L42.2 26 Z" fill={palette.fg} />
        </g>
      </g>
      <Head fill={palette.mint} />
      <ellipse cx="22" cy="13" rx="13" ry="4" fill={palette.brandDeep} transform="rotate(-9 22 13)" />
      <circle cx="19.5" cy="8.6" r="1.8" fill={palette.brandDeep} />
      <Face state={state} ink={palette.ink} blinkDelay={blinkDelay} />
    </>
  ),
  tasks: ({ state, blinkDelay }) => (
    <>
      <path d="M5.5 26 C5.5 5 42.5 5 42.5 26" stroke={palette.brandDeep} strokeWidth="3" {...line} />
      <Head fill={palette.ink} stroke={palette.brand} />
      {[3, 39.5].map((x) => (
        <rect key={x} className={state === 'working' ? 'av-beat' : undefined} x={x} y="20.5" width="5.5" height="11" rx="2.2" fill={palette.brand} />
      ))}
      <Face
        state={state}
        ink={palette.brand}
        blinkDelay={blinkDelay}
        focusedEyes={
          <>
            <path d="M15.5 21.5 L19.5 25 L15.5 28.5" stroke={palette.brand} strokeWidth="1.8" {...line} />
            <path d="M32.5 21.5 L28.5 25 L32.5 28.5" stroke={palette.brand} strokeWidth="1.8" {...line} />
          </>
        }
      />
    </>
  ),
  reviewer: ({ state, blinkDelay }) => (
    <>
      <Head fill={palette.brandMid} />
      <Face state={state} ink={palette.fg} blinkDelay={blinkDelay} />
      <rect x="33.5" y="23.5" width="12.5" height="15" rx="2" fill={palette.keyCap} stroke={palette.brand} strokeWidth="1.2" />
      <rect x="36.8" y="21.8" width="6" height="3.2" rx="1" fill={palette.brand} />
      {state === 'waiting' ? (
        <path d="M36.4 29 L43.2 29 M36.4 32.5 L41.4 32.5" stroke={palette.brandMid} strokeWidth="1.3" {...line} />
      ) : (
        <path
          className={state === 'working' ? 'av-draw' : undefined}
          pathLength={1}
          d="M36.4 31 L38.8 33.4 L43.2 28.4"
          stroke={palette.brand}
          strokeWidth="1.6"
          {...line}
        />
      )}
    </>
  ),
  junction: ({ state, blinkDelay }) => {
    const pieces = { waiting: ['av-apart-l', 'av-apart-r'], working: ['av-join-l', 'av-join-r'], done: [] }[state]
    return (
      <>
        <g className={pieces[0]}>
          <rect x="11" y="2.5" width="11" height="8" rx="1.6" fill={palette.brand} />
          <circle cx="22.6" cy="6.5" r="2.4" fill={palette.brand} />
        </g>
        <rect className={pieces[1]} x="25" y="2.5" width="11" height="8" rx="1.6" fill={palette.mint} />
        <Head fill={palette.ink} stroke={palette.mint} />
        <Face state={state} ink={palette.mint} blinkDelay={blinkDelay} />
      </>
    )
  },
  simplifier: ({ state, blinkDelay }) => (
    <>
      <Head fill={palette.keyCap} stroke={palette.brand} />
      <Face state={state} ink={palette.brand} blinkDelay={blinkDelay} />
      <g className={state === 'working' ? 'av-sweep' : undefined} style={{ transformOrigin: '38.5px 11.5px' }}>
        <path d="M38.5 11.5 L42 28" stroke={palette.fgDim} strokeWidth="2" {...line} />
        <rect x="38.4" y="27" width="7.2" height="2.8" rx="1" fill={palette.brandDeep} />
        <path d="M38.6 29.6 L45.4 29.6 L47.6 38.6 L36.4 38.6 Z" fill={palette.brand} />
        <path d="M40.2 31.5 L39.4 37 M42 31.5 L42 37 M43.8 31.5 L44.6 37" stroke={palette.brandDeep} strokeWidth="0.8" {...line} />
      </g>
      {state === 'working' &&
        [0, 0.35].map((delay, index) => (
          <circle key={delay} className="av-dust" cx={36 - index * 2.5} cy={38 - index} r="1.1" fill={palette.fgDim} style={{ animationDelay: `${delay}s` }} />
        ))}
    </>
  ),
  skeptic: ({ state, blinkDelay }) => (
    <>
      <Head fill={palette.fgDim} />
      <Face state={state} ink={palette.ink} blinkDelay={blinkDelay} squint />
      {state === 'done' ? (
        <path d="M14 18.5 Q18 16 22 18.5 M26.5 18.5 Q30.5 16 34.5 18.5" stroke={palette.ink} strokeWidth="1.7" {...line} />
      ) : (
        <>
          <path className={state === 'working' ? 'av-brow' : undefined} d="M14 18.5 Q18 15.5 22 17" stroke={palette.ink} strokeWidth="1.7" {...line} />
          <path d="M27 21.5 L33.5 19" stroke={palette.ink} strokeWidth="1.7" {...line} />
        </>
      )}
      {state !== 'done' && (
        <g fontFamily="Unbounded, sans-serif" fontWeight="700" fontSize="11" textAnchor="middle">
          <text className={state === 'working' ? 'av-alt-a' : undefined} x="42" y="11" fill={palette.brand}>
            ?
          </text>
          {state === 'working' && (
            <text className="av-alt-b" x="42" y="11" fill={palette.fg}>
              ✕
            </text>
          )}
        </g>
      )}
    </>
  ),
}

/** Сдвиги фаз, чтобы соседние роботы моргали и покачивались не синхронно. */
const PHASE: Record<AgentId, { blink: string; motion: string }> = {
  requirements: { blink: '0s', motion: '0s' },
  analyst: { blink: '-1.3s', motion: '-0.9s' },
  stories: { blink: '-2.6s', motion: '-2.1s' },
  tasks: { blink: '-0.7s', motion: '-0.4s' },
  reviewer: { blink: '-3.4s', motion: '-1.6s' },
  junction: { blink: '-1.9s', motion: '-2.8s' },
  simplifier: { blink: '-4.1s', motion: '-0.6s' },
  skeptic: { blink: '-2.2s', motion: '-3.3s' },
}

interface AgentFigureProps {
  id: AgentId
  /**
   * waiting — моргает и еле заметно дышит; working — сосредоточен, атрибут в деле;
   * done — улыбается, подпрыгивает один раз и получает галочку.
   */
  state?: AgentState
}

/** Фигура робота в координатах AGENT_FIGURE_BOX — для вставки внутрь другого SVG. */
export function AgentFigure({ id, state = 'waiting' }: AgentFigureProps) {
  const Mini = MINIS[id]
  const phase = PHASE[id]
  return (
    <g className={`av-body av-body--${state}`} style={state === 'done' ? undefined : { animationDelay: phase.motion }}>
      <Mini state={state} blinkDelay={phase.blink} />
      {state === 'done' && <DoneBadge />}
    </g>
  )
}

interface AgentAvatarProps extends AgentFigureProps {
  /** Ширина в пикселях; высота — по пропорции 48 × 40. */
  size?: number
}

export function AgentAvatar({ id, size = 40, state }: AgentAvatarProps) {
  const { width, height } = AGENT_FIGURE_BOX
  return (
    <svg
      width={size}
      height={(size * height) / width}
      viewBox={`0 0 ${width} ${height}`}
      overflow="visible"
      aria-hidden="true"
      className="shrink-0"
    >
      <AgentFigure id={id} state={state} />
    </svg>
  )
}
