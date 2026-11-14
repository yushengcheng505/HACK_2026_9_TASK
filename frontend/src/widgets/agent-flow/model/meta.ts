import type { RunView } from '@/entities/run'
import { plural } from '@/shared/lib/plural'
import type { AgentInstance } from './agents'

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
    case 'simplifier': {
      const n = own(inst.kind === 'junction' ? 'editor' : 'simplifier').length
      return view.calls[inst.kind] ? `${n} ${plural(n, 'находка', 'находки', 'находок')}` : ''
    }
    case 'skeptic': {
      const r = view.review
      return r.confirmed + r.rejected + r.downgraded ? `✓${r.confirmed} ↓${r.downgraded} ✗${r.rejected}` : ''
    }
  }
}
