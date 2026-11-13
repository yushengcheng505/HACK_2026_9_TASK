import { nodeKey } from './trace'

/** ID из замечаний ОТК → ключ узла на карте. */
export function keyForId(id: string): string {
  if (id.startsWith('REQ-')) return nodeKey('requirement', id)
  if (id.startsWith('US-')) return nodeKey('story', id)
  if (id.startsWith('TASK-')) return nodeKey('task', id)
  return nodeKey('source', id)
}
