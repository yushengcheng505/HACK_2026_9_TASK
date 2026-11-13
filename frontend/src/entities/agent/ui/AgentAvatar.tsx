import type { AgentAvatarColors } from '../model/types'

interface AgentAvatarProps {
  colors: AgentAvatarColors
}

export function AgentAvatar({ colors }: AgentAvatarProps) {
  return (
    <svg width="34" height="28" viewBox="0 0 34 28" aria-hidden="true" className="shrink-0">
      <rect x="1.5" y="1.5" width="31" height="25" rx="8" fill={colors.body} stroke={colors.stroke} strokeWidth="1.5" />
      <rect x="10" y="9" width="4" height="9" rx="2" fill={colors.eye} />
      <rect x="20" y="9" width="4" height="9" rx="2" fill={colors.eye} />
    </svg>
  )
}
