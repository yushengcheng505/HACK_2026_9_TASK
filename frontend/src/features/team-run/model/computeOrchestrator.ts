import { AGENTS } from '@/entities/agent'
import { clamp } from '@/shared/lib/math'
import { agentTiming, RUN_TIMELINE, TYPING_SPEED } from './timeline'
import type { LogLine, OrchestratorMood, OrchestratorState } from './types'

const VISIBLE_LOG_LINES = 4

interface LogEntry {
  at: number
  text: string
}

const { waveStart } = RUN_TIMELINE

const LOG: readonly LogEntry[] = [
  { at: 0.2, text: 'эпик получен' },
  { at: 1.1, text: 'план: 4 этапа и 4 проверки' },
  { at: waveStart.decomposition + 0.1, text: 'раздаю декомпозицию' },
  { at: waveStart.review + 0.1, text: 'отдаю на проверку' },
  ...AGENTS.map((agent, index) => ({
    at: agentTiming(index).deliveredAt,
    text: `${agent.name}: готово · ${index + 1}/${AGENTS.length}`,
  })),
  { at: RUN_TIMELINE.assemblyStart, text: 'собираю итог' },
  { at: RUN_TIMELINE.complete, text: 'задачи готовы' },
].sort((a, b) => a.at - b.at)

function statusWordFor(mood: OrchestratorMood, time: number) {
  if (mood === 'done') return 'готово'
  if (mood === 'typing') return 'печатает'
  return time >= waveStart.decomposition ? 'ждёт агентов' : 'думает'
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
