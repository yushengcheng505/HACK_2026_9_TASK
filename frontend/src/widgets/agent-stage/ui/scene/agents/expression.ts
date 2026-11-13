import type { AgentStatus } from '@/features/team-run'

export type Expression = 'neutral' | 'focused' | 'happy'

export const EXPRESSION_BY_STATUS: Record<AgentStatus, Expression> = {
  waiting: 'neutral',
  working: 'focused',
  done: 'happy',
}

/** Все роботы-агенты рисуются в локальных координатах: x = 0 — центр агента. */
export interface BotProps {
  expression: Expression
  /** Агент сейчас работает над задачей. */
  active: boolean
  blinkDelay: string
}
