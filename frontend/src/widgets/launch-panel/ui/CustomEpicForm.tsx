import { useState } from 'react'
import type { FormEvent } from 'react'
import type { InputRole } from '@/features/launch-run'
import { ROLE_LABELS, fileKind, startCustom } from '@/features/launch-run'
import { Toggle } from '@/shared/ui/Toggle'
import { navigate } from '@/shared/lib/useHashRoute'

const ROLES = Object.keys(ROLE_LABELS) as InputRole[]
const emptyFiles = (): Record<InputRole, File[]> => ({ product_docs: [], external_docs: [], contracts: [], examples: [] })

interface CustomEpicFormProps {
  onError: (message: string) => void
}

export function CustomEpicForm({ onError }: CustomEpicFormProps) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [skip, setSkip] = useState(false)
  const [files, setFiles] = useState(emptyFiles)
  const [busy, setBusy] = useState(false)

  const addFiles = (role: InputRole, list: FileList | null) => {
    if (!list) return
    const picked = [...list].filter((f) => !f.name.toLowerCase().endsWith('.pdf'))
    if (picked.length < list.length) onError('PDF не поддерживается — загрузите md, txt или docx')
    setFiles((prev) => ({ ...prev, [role]: [...prev[role], ...picked] }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { run_id } = await startCustom({ title: title.trim() || 'Эпик без названия', text, skipQuestions: skip, files })
      navigate({ name: 'run', id: run_id })
    } catch (e) {
      onError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="tag text-fg-dim">Название эпика</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Интеграция с SCADA: телеметрия подстанций"
          className="min-h-11 rounded-[2px] border border-line-input bg-ink px-3.5 text-[15px] text-fg placeholder:text-fg-dim/60 focus:border-brand"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="tag flex justify-between text-fg-dim">
          <span>Текст эпика</span>
          <span>{text.length} симв.</span>
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={8}
          placeholder={'Что должно получиться:\n- …\n\nОграничения:\n- …'}
          className="resize-y rounded-[2px] border border-line-input bg-ink px-3.5 py-3 font-mono text-[13px] leading-relaxed text-fg placeholder:text-fg-dim/60 focus:border-brand"
        />
      </label>

      <div className="grid gap-px border border-line bg-line 2xl:grid-cols-2">
        {ROLES.map((role) => (
          <label
            key={role}
            className="press group flex cursor-pointer flex-col gap-2 bg-ink px-4 py-3.5 hover:bg-surface"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              addFiles(role, e.dataTransfer.files)
            }}
          >
            <span className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-fg-soft">{ROLE_LABELS[role].label}</span>
              <span className="tag text-brand opacity-70 group-hover:opacity-100">+ файл</span>
            </span>
            <span className="tag text-fg-dim">{ROLE_LABELS[role].hint}</span>
            <input
              type="file"
              multiple
              accept={ROLE_LABELS[role].accept}
              className="sr-only"
              onChange={(e) => addFiles(role, e.target.files)}
            />
            {files[role].length > 0 && (
              <span className="flex flex-wrap gap-1.5">
                {files[role].map((f, i) => (
                  <button
                    type="button"
                    key={`${f.name}-${i}`}
                    title="Убрать файл"
                    onClick={(e) => {
                      e.preventDefault()
                      setFiles((prev) => ({ ...prev, [role]: prev[role].filter((_, j) => j !== i) }))
                    }}
                    className="press inline-flex cursor-pointer items-center gap-1.5 border border-line-strong bg-surface px-2 py-1 hover:border-hazard"
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Toggle checked={skip} onChange={setSkip} label="Без вопросов" />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="press inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[2px] border border-brand px-5 font-display text-[14px] font-semibold text-brand hover:bg-brand hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Запускаю…' : 'Разложить эпик'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="tag leading-relaxed text-fg-dim">
        Работает и на одном тексте эпика. Документы — данные, а не инструкции модели.
      </p>
    </form>
  )
}
