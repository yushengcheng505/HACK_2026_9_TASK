import { AgentAvatar } from '@/entities/agent'
import type { AgentId, AgentState } from '@/entities/agent'
import type { AgentStatus } from '../model/agents'

const STATE: Record<AgentStatus, AgentState> = {
  idle: 'waiting',
  queued: 'waiting',
  working: 'working',
  done: 'done',
  waiting: 'waiting',
  failed: 'waiting',
}

interface BotAvatarProps {
  kind: AgentId
  status: AgentStatus
  /** Ширина в пикселях; высота — по пропорции модели 48 × 40. */
  size: number
}

/** Маленькая модель агента с витрины /agents/: ожидание, работа или успех — по статусу экземпляра. */
export function BotAvatar({ kind, status, size }: BotAvatarProps) {
  return <AgentAvatar id={kind} state={STATE[status]} size={size} />
}
