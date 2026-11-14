import { useState } from 'react'
import { TASK_TYPE, nodeKey } from '@/entities/run'
import type { Decomposition, RunView, Task, TaskType } from '@/entities/run'
import { saveResult } from '@/features/edit-result'

interface ResultsTableProps {
  view: RunView
  onSaved: () => Promise<void>
  onSelect: (key: string) => void
}

const TYPES = Object.keys(TASK_TYPE) as TaskType[]

export function ResultsTable({ view, onSaved, onSelect }: ResultsTableProps) {
  const [edited, setEdited] = useState<Decomposition | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = edited !== null
  const draft = edited ?? view.result
  const setDraft = (update: (d: Decomposition | null) => Decomposition | null) => setEdited(update(draft))

  const stories = draft?.stories ?? view.stories
  const editable = !!draft && view.status === 'done'

  const patchTask = (storyId: string, taskId: string, patch: Partial<Task> | null) => {
    setDraft((d) =>
      d && {
        ...d,
        stories: d.stories.map((s) =>
          s.id !== storyId
            ? s
            : {
                ...s,
                tasks: patch === null ? s.tasks.filter((t) => t.id !== taskId) : s.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
              },
        ),
      },
    )
  }

  const patchStory = (storyId: string, title: string) => {
    setDraft((d) => d && { ...d, stories: d.stories.map((s) => (s.id === storyId ? { ...s, title } : s)) })
  }

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      await saveResult(view.runId, draft)
      await onSaved()
      setEdited(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-[52px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-2">
        <p className="text-[13px] text-fg-muted">
          {editable ? 'Текст и типы можно править — проверки пересчитаются без новой генерации.' : 'Править можно, когда прогон закончится.'}
        </p>
        {(dirty || error) && (
          <div className="fx-fade flex items-center gap-3">
            {error && <span className="font-mono text-[12px] text-hazard">{error}</span>}
            {dirty && <span className="text-[12.5px] text-amber">есть правки</span>}
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => setEdited(null)}
              className="press cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold text-fg-soft hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              Отменить
            </button>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={save}
              className="press inline-flex min-h-8 cursor-pointer items-center rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Проверяю…' : 'Сохранить и перепроверить'}
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <thead className="sticky top-0 z-[1] bg-ink">
            <tr>
              {['ID', 'Тип', 'Формулировка', 'Требования', 'Источники', ''].map((h) => (
                <th key={h} className="tag border-b border-line-strong px-2 py-2 font-normal text-fg-dim">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stories.map((s) => (
              <StoryRows
                key={s.id}
                story={s}
                editable={editable}
                onSelect={onSelect}
                onStoryTitle={(title) => patchStory(s.id, title)}
                onTask={(taskId, patch) => patchTask(s.id, taskId, patch)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface StoryRowsProps {
  story: RunView['stories'][number]
  editable: boolean
  onSelect: (key: string) => void
  onStoryTitle: (title: string) => void
  onTask: (taskId: string, patch: Partial<Task> | null) => void
}

function StoryRows({ story, editable, onSelect, onStoryTitle, onTask }: StoryRowsProps) {
  const cell = 'border-b border-line px-2 py-2 align-top'
  const input =
    'w-full resize-none rounded-[2px] border border-transparent bg-transparent px-1.5 py-1 text-[13px] leading-snug text-fg-soft hover:border-line-strong focus:border-brand focus:bg-ink disabled:hover:border-transparent'
  return (
    <>
      <tr className="bg-panel/60">
        <td className={cell}>
          <button type="button" onClick={() => onSelect(nodeKey('story', story.id))} className="press cursor-pointer font-mono text-[12px] font-bold text-brand hover:underline">
            {story.id}
          </button>
        </td>
        <td className={`${cell} tag text-fg-dim`}>история</td>
        <td className={cell}>
          <textarea rows={2} disabled={!editable} value={story.title} onChange={(e) => onStoryTitle(e.target.value)} className={`${input} font-semibold text-fg`} />
        </td>
        <td className={`${cell} font-mono text-[11px] text-fg-dim`}>{story.requirement_ids.join(', ')}</td>
        <td className={cell} />
        <td className={cell} />
      </tr>
      {story.tasks.map((t) => (
        <tr key={t.id} className="group">
          <td className={`${cell} pl-5`}>
            <button type="button" onClick={() => onSelect(nodeKey('task', t.id))} className="press cursor-pointer font-mono text-[12px] text-fg hover:text-brand">
              {t.id}
            </button>
          </td>
          <td className={cell}>
            <select
              disabled={!editable}
              value={t.type}
              onChange={(e) => onTask(t.id, { type: e.target.value as TaskType })}
              className="rounded-[2px] border border-line-strong bg-ink px-1.5 py-1 font-mono text-[11px] text-fg-soft disabled:opacity-70"
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>{TASK_TYPE[type].label}</option>
              ))}
            </select>
          </td>
          <td className={cell}>
            <textarea rows={2} disabled={!editable} value={t.title} onChange={(e) => onTask(t.id, { title: e.target.value })} className={input} />
          </td>
          <td className={`${cell} font-mono text-[11px] ${t.requirement_ids.length ? 'text-fg-dim' : 'text-hazard'}`}>
            {t.requirement_ids.join(', ') || 'нет'}
          </td>
          <td className={`${cell} max-w-[260px]`}>
            <span className="flex flex-wrap gap-1">
              {t.source_refs.map((ref) => (
                <span key={ref} className="max-w-full truncate rounded-[5px] bg-surface px-1.5 py-px font-mono text-[10.5px] text-fg-dim" title={ref}>
                  {ref.replace(/^PROTO:/, '')}
                </span>
              ))}
            </span>
          </td>
          <td className={`${cell} text-right`}>
            {editable && (
              <button
                type="button"
                onClick={() => onTask(t.id, null)}
                title="Удалить задачу"
                className="press tag cursor-pointer px-2 py-1 text-fg-dim opacity-0 group-hover:opacity-100 hover:text-hazard focus-visible:opacity-100"
              >
                удалить
              </button>
            )}
          </td>
        </tr>
      ))}
    </>
  )
}
