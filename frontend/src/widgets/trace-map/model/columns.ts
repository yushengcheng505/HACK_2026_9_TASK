import type { RunView, SourceKind, SourceRef } from '@/entities/run'

export interface SourceGroup {
  title: string
  items: SourceRef[]
}

const GROUPS: { title: string; kinds: SourceKind[] }[] = [
  { title: 'Эпик', kinds: ['epic'] },
  { title: 'Контракт', kinds: ['proto_rpc', 'openapi_op'] },
  { title: 'Документация', kinds: ['doc'] },
  { title: 'Сообщения контракта', kinds: ['proto_message'] },
  { title: 'Примеры', kinds: ['example'] },
]

/** Сообщения .proto показываем, только если на них кто-то ссылается: иначе колонка утонет в DTO. */
export function sourceGroups(view: RunView): SourceGroup[] {
  const referenced = new Set([
    ...view.requirements.flatMap((r) => r.source_refs),
    ...view.stories.flatMap((s) => s.tasks.flatMap((t) => t.source_refs)),
    ...view.gaps.flatMap((g) => g.source_refs),
  ])
  return GROUPS.map((g) => ({
    title: g.title,
    items: view.sources.filter((s) => g.kinds.includes(s.kind) && (s.kind !== 'proto_message' || referenced.has(s.id))),
  })).filter((g) => g.items.length)
}
