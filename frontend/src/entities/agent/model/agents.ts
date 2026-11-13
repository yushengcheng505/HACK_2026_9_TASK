import { palette } from '@/shared/config/palette'
import type { Agent } from './types'

export const AGENTS: readonly Agent[] = [
  {
    id: 'scout',
    name: 'Ищейка',
    nameAccusative: 'Ищейку',
    role: 'исследователь',
    avatar: { body: palette.brandDeep, stroke: palette.brandMid, eye: palette.brand },
  },
  {
    id: 'lens',
    name: 'Лупа',
    nameAccusative: 'Лупу',
    role: 'аналитик',
    avatar: { body: palette.brand, stroke: palette.brand, eye: palette.ink },
  },
  {
    id: 'coder',
    name: 'Бит',
    nameAccusative: 'Бита',
    role: 'разработчик',
    avatar: { body: palette.ink, stroke: palette.brand, eye: palette.brand },
  },
  {
    id: 'editor',
    name: 'Перо',
    nameAccusative: 'Перо',
    role: 'редактор',
    avatar: { body: palette.mint, stroke: palette.mint, eye: palette.ink },
  },
]
