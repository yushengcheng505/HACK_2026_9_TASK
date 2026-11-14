import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { Finding, RunView, SourceKind } from '@/entities/run'

export type Tone = 'brand' | 'mint' | 'amber' | 'hazard' | 'dim'

export interface ParticleApi {
  send(edgeId: string, label: string, tone: Tone, delay?: number): void
  /** Перенести копию элемента (робота) по ребру; `landed` — когда долетел. */
  carry(edgeId: string, source: Element, delay: number): { duration: number; landed: Promise<void> } | null
  /** Короткая вспышка искр в точке мира. */
  burst(x: number, y: number, tone: Tone, delay?: number): void
}

const SOURCE_LABEL: Record<SourceKind, string> = {
  epic: 'EPIC',
  doc: 'DOC',
  proto_rpc: 'RPC',
  proto_message: 'MSG',
  openapi_op: 'API',
  example: 'EX',
}

const STAGGER = 90
const MAX_PER_EDGE = 6

/** Откуда находка уходит к Скептику. */
function findingEdge(f: Finding): string | null {
  if (f.verdict === 'rejected_by_filter') return null
  if (f.source === 'analyst') return 'an-sk'
  if (f.source === 'editor') return 'junction-sk'
  if (f.source === 'simplifier') return 'simplifier-sk'
  return f.story_ids[0] ? `rev-sk:${f.story_ids[0]}` : null
}

interface Snapshot {
  seq: number
  sources: number
  requirements: number
  stories: number
  tasks: Set<string>
  findings: number
  feedback: number
  coverage: RunView['coverage']
  status: RunView['status']
}

const snapshot = (view: RunView): Snapshot => ({
  seq: view.lastSeq,
  sources: view.sources.length,
  requirements: view.requirements.length,
  stories: view.stories.length,
  tasks: new Set(view.stories.flatMap((s) => s.tasks.map((t) => t.id))),
  findings: view.findings.length,
  feedback: view.feedback.length,
  coverage: view.coverage,
  status: view.status,
})

/** Сравнивает прогон с прошлым кадром и пускает метки артефактов по рёбрам, куда они ушли. */
export function useParticles(view: RunView, api: RefObject<ParticleApi | null>, armed: boolean) {
  const prev = useRef<Snapshot | null>(null)

  useEffect(() => {
    const before = prev.current
    const now = snapshot(view)
    prev.current = now
    const fx = api.current
    if (!before || !fx || !armed || now.seq < before.seq) return
    // Ряды новых историй появляются в этом же кадре — ждём, пока отрисуются их рёбра.
    window.requestAnimationFrame(() => {
      const burst = (edge: string, labels: string[], tone: Tone) =>
        labels.slice(0, MAX_PER_EDGE).forEach((label, i) => fx.send(edge, label, tone, i * STAGGER))

      if (now.sources > before.sources) burst('prep', view.sources.slice(before.sources).map((s) => SOURCE_LABEL[s.kind]), 'dim')
      if (now.requirements > before.requirements) burst('req-an', view.requirements.slice(before.requirements).map((r) => r.id), 'brand')
      if (now.stories > before.stories) {
        // До генераторов историю «доносит» сам робот при рождении — здесь только путь от Аналитика.
        burst('an-st', view.stories.slice(before.stories).map((s) => s.id), 'mint')
      }
      for (const s of view.stories) {
        const fresh = s.tasks.filter((t) => !before.tasks.has(t.id)).map((t) => t.id)
        if (fresh.length) burst(`gen-gate:${s.id}`, fresh, 'brand')
      }
      if (now.coverage && now.coverage !== before.coverage && view.status !== 'done') {
        view.stories.forEach((s, i) => fx.send(`gate-rev:${s.id}`, 'ОТК', 'mint', i * 60))
        fx.send('gate-junction', 'ОТК', 'mint')
        fx.send('gate-simplifier', 'ОТК', 'mint')
      }
      if (now.findings > before.findings) {
        const byEdge = new Map<string, string[]>()
        for (const f of view.findings.slice(before.findings)) {
          const edge = findingEdge(f)
          if (edge) byEdge.set(edge, [...(byEdge.get(edge) ?? []), f.id])
        }
        byEdge.forEach((labels, edge) => burst(edge, labels, 'hazard'))
      }
      if (now.feedback > before.feedback) {
        for (const n of view.feedback.at(-1)?.notes ?? []) fx.send(`loop:${n.story_id}`, `↺ ${n.story_id}`, 'amber')
      }
      if (now.status === 'done' && before.status !== 'done') fx.send('sk-result', 'ИТОГ', 'mint')
    })
  }, [view, api, armed])
}
