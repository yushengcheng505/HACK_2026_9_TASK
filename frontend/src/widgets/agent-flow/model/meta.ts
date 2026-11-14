import type { RunView } from '@/entities/run'
import type { AgentInstance } from './agents'

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10
  const m100 = n % 100
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
}

/** Короткая сводка под агентом: что он уже выдал. */
export function metaFor(inst: AgentInstance, view: RunView): string {
  const own = (source: string) =>
    view.findings.filter((f) => f.source === source && f.verdict !== 'rejected_by_filter' && (!inst.storyId || f.story_ids.includes(inst.storyId)))
  switch (inst.kind) {
    case 'requirements':
      return view.requirements.length ? `${view.requirements.length} требований` : ''
    case 'analyst':
      return view.gaps.length || view.questions.length ? `${view.gaps.length} проб. · ${view.questions.length} вопр.` : ''
    case 'stories':
      return view.stories.length ? `${view.stories.length} ${plural(view.stories.length, 'история', 'истории', 'историй')}` : ''
    case 'tasks': {
      const n = view.stories.find((s) => s.id === inst.storyId)?.tasks.length ?? 0
      const redo = view.feedback.filter((f) => f.notes.some((x) => x.story_id === inst.storyId)).length
      return n ? `${n} задач${redo ? ` · ↺${redo}` : ''}` : ''
    }
    case 'reviewer': {
      const n = own('reviewer').length
      return view.calls[inst.key] ? `${n} ${plural(n, 'находка', 'находки', 'находок')}` : ''
    }
    case 'junction':
      return view.calls.junction ? `${own('editor').length} находок` : ''
    case 'simplifier':
      return view.calls.simplifier ? `${own('simplifier').length} находок` : ''
    case 'skeptic': {
      const r = view.review
      return r.confirmed + r.rejected + r.downgraded ? `✓${r.confirmed} ↓${r.downgraded} ✗${r.rejected}` : ''
    }
  }
}
