import { palette } from '@/shared/config/palette'

interface LogoMarkProps {
  mood?: 'calm' | 'happy'
}

export function LogoMark({ mood = 'calm' }: LogoMarkProps) {
  return (
    <svg width="40" height="32" viewBox="0 0 40 32" aria-hidden="true" className="shrink-0">
      <rect x="2" y="4" width="36" height="26" rx="8" fill={palette.brand} />
      {mood === 'calm' ? (
        <>
          <rect x="12" y="11" width="5" height="10" rx="2" fill={palette.ink} />
          <rect x="23" y="11" width="5" height="10" rx="2" fill={palette.ink} />
        </>
      ) : (
        <>
          <path d="M10 18 Q14 11 18 18" fill="none" stroke={palette.ink} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M22 18 Q26 11 30 18" fill="none" stroke={palette.ink} strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
