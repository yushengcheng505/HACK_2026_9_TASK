import type { ComponentType } from 'react'
import type { AgentId } from '@/entities/agent'
import { AnalystBot } from './AnalystBot'
import type { BotProps } from './expression'
import { JunctionBot } from './JunctionBot'
import { RequirementsBot } from './RequirementsBot'
import { ReviewerBot } from './ReviewerBot'
import { SimplifierBot } from './SimplifierBot'
import { SkepticBot } from './SkepticBot'
import { StoriesBot } from './StoriesBot'
import { TasksBot } from './TasksBot'

export const AGENT_BOTS: Record<AgentId, ComponentType<BotProps>> = {
  requirements: RequirementsBot,
  analyst: AnalystBot,
  stories: StoriesBot,
  tasks: TasksBot,
  reviewer: ReviewerBot,
  junction: JunctionBot,
  simplifier: SimplifierBot,
  skeptic: SkepticBot,
}
