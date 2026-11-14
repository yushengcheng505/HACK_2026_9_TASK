import { useCallback, useEffect, useRef, useState } from 'react'
import { applyEvent, emptyRun, withResult } from '@/entities/run'
import type { RunEvent, RunRecord, RunView } from '@/entities/run'
import { api, eventsUrl } from '@/shared/api'

const EVENT_TYPES = [
  'run_started', 'node_started', 'node_finished', 'sources_parsed', 'language_detected', 'token',
  'requirement_created', 'gap_found', 'questions_asked', 'waiting_answers', 'answers_received',
  'story_created', 'tasks_replaced', 'task_created', 'checks_finished', 'critic_feedback',
  'run_finished', 'run_failed', 'result_edited', 'tasks_failed', 'llm_retry',
  'findings_collected', 'findings_judged', 'findings_resolution', 'tasks_removed', 'review_skipped',
] as const

const TERMINAL = new Set(['run_finished', 'run_failed'])

/** Поток событий прогона → модель для отрисовки. replay — проигрывание записи с исходными паузами. */
export function useRunStream(runId: string) {
  const [view, setView] = useState<RunView>(() => emptyRun(runId))
  const [replay, setReplay] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const queue = useRef<RunEvent[]>([])
  const frame = useRef(0)

  const refresh = useCallback(async () => {
    const run = await api.get<RunRecord>(`/runs/${runId}`)
    setView((v) => {
      let base = run.result ? withResult(v, run.result) : v
      if (!replay) {
        const terminal = run.status === 'done' || run.status === 'failed'
        base = {
          ...base,
          title: base.title || run.title,
          startedAt: run.created_at * 1000,
          finishedAt: terminal && run.updated_at ? run.updated_at * 1000 : null,
        }
      }
      if (run.status === 'failed' && base.status !== 'failed') {
        return { ...base, status: 'failed', error: run.error ?? 'Запуск прерван', activeNode: null }
      }
      return base
    })
  }, [runId, replay])

  useEffect(() => {
    queue.current = []
    const source = new EventSource(eventsUrl(runId, replay))
    let closed = false

    const flush = () => {
      frame.current = 0
      const batch = queue.current
      queue.current = []
      if (batch.length) setView((v) => batch.reduce(applyEvent, v))
    }

    const onEvent = (type: string) => (message: MessageEvent<string>) => {
      queue.current.push({ seq: Number(message.lastEventId), type, data: JSON.parse(message.data), receivedAt: Date.now() })
      if (!frame.current) frame.current = requestAnimationFrame(flush)
      if (TERMINAL.has(type) || type === 'result_edited') {
        if (TERMINAL.has(type)) {
          closed = true
          source.close()
        }
        window.setTimeout(() => void refresh(), 60)
      }
    }

    const initial = replay ? 0 : window.setTimeout(() => void refresh(), 0)
    for (const type of EVENT_TYPES) source.addEventListener(type, onEvent(type) as EventListener)
    source.onerror = () => {
      if (closed) return
      void api.get<RunRecord>(`/runs/${runId}`).then((run) => {
        if (run.status === 'done' || run.status === 'failed' || replay) {
          closed = true
          source.close()
          void refresh()
        }
      })
    }

    return () => {
      closed = true
      source.close()
      window.clearTimeout(initial)
      if (frame.current) cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }, [runId, replay, epoch, refresh])

  const startReplay = useCallback(() => {
    setView(emptyRun(runId))
    setReplay(true)
    setEpoch((e) => e + 1)
  }, [runId])

  return { view, setView, refresh, replay, startReplay }
}
