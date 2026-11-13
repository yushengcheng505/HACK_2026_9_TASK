import type { ComponentType } from 'react'
import type { AgentId } from '@/entities/agent'
import { CoderBot } from './CoderBot'
import { EditorBot } from './EditorBot'
import type { BotProps } from './expression'
import { LensBot } from './LensBot'
import { ScoutBot } from './ScoutBot'

export const AGENT_BOTS: Record<AgentId, ComponentType<BotProps>> = {
  scout: ScoutBot,
  lens: LensBot,
  coder: CoderBot,
  editor: EditorBot,
}
