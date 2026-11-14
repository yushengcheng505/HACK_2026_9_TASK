import { palette } from '@/shared/config/palette'

interface LogoMarkProps {
  mood?: 'calm' | 'happy'
}

/** Голова NAPS из трейлера SYNAPS: корпус-монитор с антенной, тёмный экран, лицо. */
export function LogoMark({ mood = 'calm' }: LogoMarkProps) {
  return (
    <svg width="40" height="36" viewBox="-154 -270 308 274" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="-200" x2="0" y2="-240" stroke={palette.brand} strokeWidth="8" strokeLinecap="round" />
      <circle cx="0" cy="-252" r="14" fill={palette.brand} stroke={palette.brand} strokeWidth="5" />
      <rect x="-150" y="-200" width="300" height="200" rx="48" fill={palette.brandDeep} stroke={palette.brand} strokeWidth="8" />
      <rect x="-130" y="-180" width="260" height="160" rx="26" fill={palette.ink} />
      {mood === 'calm' ? (
        <>
          <rect x="-75" y="-135" width="30" height="46" rx="9" fill={palette.brand} />
          <rect x="45" y="-135" width="30" height="46" rx="9" fill={palette.brand} />
        </>
      ) : (
        <>
          <path d="M-78 -104 Q-60 -130 -42 -104" fill="none" stroke={palette.brand} strokeWidth="9" strokeLinecap="round" />
          <path d="M42 -104 Q60 -130 78 -104" fill="none" stroke={palette.brand} strokeWidth="9" strokeLinecap="round" />
        </>
      )}
      <path d="M-24 -56 Q0 -35 24 -56" fill="none" stroke={palette.brand} strokeWidth="8" strokeLinecap="round" />
    </svg>
  )
}
