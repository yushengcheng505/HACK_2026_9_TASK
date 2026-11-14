import { ROSTER, type AgentTeam } from '@/entities/agent'
import { clamp } from '@/shared/lib/math'
import { plural } from '@/shared/lib/plural'
import { AGENT_TIMING, RUN_TIMELINE, TYPING_SPEED } from './timeline'
import type { LogLine, OrchestratorMood, OrchestratorState } from './types'

const VISIBLE_LOG_LINES = 4

interface LogEntry {
  at: number
  text: string
}

const teamSize = (team: AgentTeam) => ROSTER.filter((agent) => agent.team === team).length
const STAGES = teamSize('decomposition')
const CHECKS = teamSize('review')
const FIRST = ROSTER[0]
const LAST = ROSTER[ROSTER.length - 1]

const LOG: readonly LogEntry[] = [
  { at: 0.2, text: 'эпик получен' },
  { at: 1.1, text: `план: ${STAGES} ${plural(STAGES, 'этап', 'этапа', 'этапов')} и ${CHECKS} ${plural(CHECKS, 'проверка', 'проверки', 'проверок')}` },
  { at: RUN_TIMELINE.start + 0.1, text: `эпик → ${FIRST.name}` },
  ...ROSTER.map((agent, index) => ({
    at: AGENT_TIMING[agent.id].doneAt,
    text: `${agent.name}: готово · ${index + 1}/${ROSTER.length}`,
  })),
  { at: RUN_TIMELINE.assemblyStart, text: `итог: ${LAST.name} → NAPS` },
  { at: RUN_TIMELINE.assemblyStart + 0.7, text: 'собираю итог' },
  { at: RUN_TIMELINE.complete, text: 'задачи готовы' },
].sort((a, b) => a.at - b.at)

function statusWordFor(mood: OrchestratorMood, time: number) {
  if (mood === 'done') return 'готово'
  if (mood === 'typing') return 'печатает'
  return time >= RUN_TIMELINE.start ? 'ждёт итог' : 'думает'
}

export function computeOrchestrator(time: number): OrchestratorState {
  const started = LOG.map((entry, key) => ({ ...entry, key })).filter((entry) => time >= entry.at)
  const visible = started.slice(-VISIBLE_LOG_LINES)

  let typing = false
  const log: LogLine[] = visible.map((entry, index) => {
    const count = Math.floor((time - entry.at) * TYPING_SPEED.log)
    if (count < entry.text.length) typing = true
    return {
      key: entry.key,
      text: entry.text.slice(0, count),
      current: index === visible.length - 1,
    }
  })

  if (time >= RUN_TIMELINE.assemblyStart && time < RUN_TIMELINE.complete) typing = true

  const mood: OrchestratorMood =
    time >= RUN_TIMELINE.complete ? 'done' : typing ? 'typing' : 'idle'

  return {
    mood,
    statusWord: statusWordFor(mood, time),
    typing,
    progress: Math.round(clamp(time / RUN_TIMELINE.complete, 0, 1) * 100),
    log,
  }
}
