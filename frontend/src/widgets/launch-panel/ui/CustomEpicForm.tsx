import { useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import type { InputRole } from '@/features/launch-run'
import { ROLE_LABELS, fileKind } from '@/features/launch-run'
import { Toggle } from '@/shared/ui/Toggle'

const ROLES = Object.keys(ROLE_LABELS) as InputRole[]
const emptyFiles = (): Record<InputRole, File[]> => ({ product_docs: [], external_docs: [], contracts: [], examples: [] })

export interface EpicDraft {
  title: string
  text: string
}

interface CustomEpicFormProps {
  draft: EpicDraft
  onDraftChange: (draft: EpicDraft) => void
  skip: boolean
  onSkipChange: (skip: boolean) => void
  /** Идёт запуск — этой формы или шаблона справа. */
  launching: boolean
  onSubmit: (files: Record<InputRole, File[]>) => void
  onError: (message: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

const fieldClass =
  'w-full rounded-2xl border border-line-input bg-ink px-[18px] text-fg placeholder:text-fg-dim/60 focus:border-brand'

export function CustomEpicForm({
  draft,
  onDraftChange,
  skip,
  onSkipChange,
  launching,
  onSubmit,
  onError,
  textareaRef,
}: CustomEpicFormProps) {
  const [files, setFiles] = useState(emptyFiles)

  const addFiles = (role: InputRole, list: FileList | null) => {
    if (!list) return
    const picked = [...list].filter((f) => !f.name.toLowerCase().endsWith('.pdf'))
    if (picked.length < list.length) onError('PDF не поддерживается — загрузите md, txt или docx')
    setFiles((prev) => ({ ...prev, [role]: [...prev[role], ...picked] }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(files)
  }

  const ready = draft.text.trim().length > 0

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="font-mono text-[12px] tracking-[0.1em] text-fg-dim uppercase">Название эпика</span>
        <input
          value={draft.title}
          onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
          placeholder="Например: интеграция с курьерской службой"
          className={`${fieldClass} min-h-[54px] text-[16px]`}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="flex justify-between font-mono text-[12px] tracking-[0.1em] text-fg-dim uppercase">
          <span>Текст эпика</span>
          <span>{draft.text.length} симв.</span>
        </span>
        <textarea
          ref={textareaRef}
          value={draft.text}
          onChange={(e) => onDraftChange({ ...draft, text: e.target.value })}
          required
          rows={7}
          placeholder={'Что должно получиться:\n- …\n\nОграничения:\n- …'}
          className={`${fieldClass} resize-y py-3.5 font-mono text-[13px] leading-relaxed`}
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[12px] tracking-[0.1em] text-fg-dim uppercase">Документы и контракты · по желанию</span>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {ROLES.map((role) => (
            <label
              key={role}
              className="press group flex cursor-pointer flex-col gap-1 rounded-2xl border border-dashed border-line-input bg-ink px-4 py-2.5 hover:border-brand"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                addFiles(role, e.dataTransfer.files)
              }}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-[13px] leading-snug font-semibold text-fg-soft">{ROLE_LABELS[role].label}</span>
                <span className="shrink-0 font-mono text-[12px] text-brand opacity-70 group-hover:opacity-100">+ файл</span>
              </span>
              <span className="font-mono text-[11px] text-fg-dim">{ROLE_LABELS[role].hint}</span>
              <input
                type="file"
                multiple
                accept={ROLE_LABELS[role].accept}
                className="sr-only"
                onChange={(e) => addFiles(role, e.target.files)}
              />
              {files[role].length > 0 && (
                <span className="flex flex-wrap gap-1.5 pt-1">
                  {files[role].map((f, i) => (
                    <button
                      type="button"
                      key={`${f.name}-${i}`}
                      title="Убрать файл"
                      onClick={(e) => {
                        e.preventDefault()
                        setFiles((prev) => ({ ...prev, [role]: prev[role].filter((_, j) => j !== i) }))
                      }}
                      className="press inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-1 hover:border-hazard"
                    >
                      <span className="font-mono text-[10px] font-bold text-brand">{fileKind(f.name)}</span>
                      <span className="font-mono text-[12px] text-fg-soft">{f.name}</span>
                      <span className="text-fg-dim">×</span>
                    </button>
                  ))}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Toggle checked={skip} onChange={onSkipChange} label="Без вопросов — по допущениям, как вебхук" />
        <button
          type="submit"
          disabled={launching || !ready}
          className="press inline-flex min-h-[54px] flex-[1_1_220px] cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-brand px-6 font-display text-[15px] font-semibold text-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
        >
          {launching ? 'Запускаю…' : 'Разложить эпик'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="text-[13px] leading-relaxed text-fg-dim">
        Работает и на одном тексте эпика. Документы — это данные, а не инструкции для модели.
      </p>
    </form>
  )
}
