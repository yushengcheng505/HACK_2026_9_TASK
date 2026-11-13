import type { RunView } from './types'

export type TraceColumn = 'source' | 'requirement' | 'story' | 'task'

export interface TraceEdge {
  from: string
  to: string
}

/** Узел карты: ID в пространстве колонки, чтобы `REQ-001` и `TASK-001` не путались с источниками. */
export const nodeKey = (column: TraceColumn, id: string) => `${column}:${id}`

export function parseKey(key: string): { column: TraceColumn; id: string } {
  const i = key.indexOf(':')
  return { column: key.slice(0, i) as TraceColumn, id: key.slice(i + 1) }
}

/** Видимые связи карты: источник → требование → история → задача. */
export function traceEdges(view: RunView): TraceEdge[] {
  const sourceIds = new Set(view.sources.map((s) => s.id))
  const edges: TraceEdge[] = []
  for (const r of view.requirements) {
    for (const ref of r.source_refs) {
      if (sourceIds.has(ref)) edges.push({ from: nodeKey('source', ref), to: nodeKey('requirement', r.id) })
    }
  }
  for (const s of view.stories) {
    for (const rid of s.requirement_ids) edges.push({ from: nodeKey('requirement', rid), to: nodeKey('story', s.id) })
    for (const t of s.tasks) edges.push({ from: nodeKey('story', s.id), to: nodeKey('task', t.id) })
  }
  return edges
}

/** Цепочка обоснования выбранного узла: источники, требования, истории и задачи, которые с ним связаны. */
export function traceOf(view: RunView, key: string): Set<string> {
  const { column, id } = parseKey(key)
  const tasks = view.stories.flatMap((s) => s.tasks.map((t) => ({ story: s, task: t })))
  const reqById = new Map(view.requirements.map((r) => [r.id, r]))
  const result = new Set<string>([key])
  const add = (c: TraceColumn, ids: Iterable<string>) => {
    for (const i of ids) result.add(nodeKey(c, i))
  }
  const sourcesOfReqs = (reqIds: Iterable<string>) => [...reqIds].flatMap((r) => reqById.get(r)?.source_refs ?? [])

  if (column === 'source') {
    const reqs = view.requirements.filter((r) => r.source_refs.includes(id)).map((r) => r.id)
    const hit = tasks.filter(({ task }) => task.source_refs.includes(id) || task.requirement_ids.some((r) => reqs.includes(r)))
    add('requirement', reqs)
    add('task', hit.map((h) => h.task.id))
    add('story', [...view.stories.filter((s) => s.requirement_ids.some((r) => reqs.includes(r))).map((s) => s.id), ...hit.map((h) => h.story.id)])
  } else if (column === 'requirement') {
    const hit = tasks.filter(({ task }) => task.requirement_ids.includes(id))
    add('source', reqById.get(id)?.source_refs ?? [])
    add('story', view.stories.filter((s) => s.requirement_ids.includes(id)).map((s) => s.id))
    add('task', hit.map((h) => h.task.id))
  } else if (column === 'story') {
    const story = view.stories.find((s) => s.id === id)
    if (story) {
      add('requirement', story.requirement_ids)
      add('source', sourcesOfReqs(story.requirement_ids))
      add('task', story.tasks.map((t) => t.id))
      add('source', story.tasks.flatMap((t) => t.source_refs))
    }
  } else {
    const hit = tasks.find(({ task }) => task.id === id)
    if (hit) {
      add('story', [hit.story.id])
      add('requirement', hit.task.requirement_ids)
      add('source', [...hit.task.source_refs, ...sourcesOfReqs(hit.task.requirement_ids)])
    }
  }
  return result
}

export type OpStatus = 'covered' | 'no_tests' | 'no_tasks' | 'unused' | 'pending'

export function contractOpStatus(view: RunView, id: string): OpStatus {
  const c = view.coverage
  if (!c) return 'pending'
  if (c.ops_without_tasks.includes(id)) return 'no_tasks'
  if (c.ops_without_tests.includes(id)) return 'no_tests'
  if (c.contract_ops_unused.includes(id)) return 'unused'
  return 'covered'
}
