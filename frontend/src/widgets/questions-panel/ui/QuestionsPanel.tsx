import { useState } from 'react'
import type { Question } from '@/entities/run'
import { sendAnswers } from '@/features/answer-questions'

interface QuestionsPanelProps {
  runId: string
  questions: Question[]
}

type Choice = { option: number } | { custom: string }

export function QuestionsPanel({ runId, questions }: QuestionsPanelProps) {
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (skip: boolean) => {
    setBusy(true)
    setError(null)
    const answers: Record<string, string> = {}
    if (!skip) {
      for (const q of questions) {
        const c = choices[q.id]
        if (!c) continue
        const text = 'option' in c ? q.options[c.option] : c.custom.trim()
        if (text) answers[q.id] = text
      }
    }
    try {
      await sendAnswers(runId, answers)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const answered = questions.filter((q) => choices[q.id]).length

  return (
    <div className="absolute inset-0 z-20 flex justify-center overflow-y-auto bg-ink/80 px-6 py-8 backdrop-blur-[3px]">
      <div className="fx-enter ticks h-fit w-full max-w-[880px] border border-amber/50 bg-surface">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-6 py-5">
          <div className="flex flex-col gap-2">
            <span className="tag flex items-center gap-2 text-amber">
              <span className="fx-pulse-amber size-2 rounded-full bg-amber" />[ граф на паузе · аналитик спрашивает ]
            </span>
            <h2 className="font-display text-[24px] leading-tight font-semibold tracking-[-0.02em] text-fg">
              Уточните, прежде чем агент разложит эпик
            </h2>
            <p className="max-w-[620px] text-[13px] leading-relaxed text-fg-muted">
              Без ответа агент примет рекомендуемый вариант и запишет его в допущения. Запуск по вебхуку идёт сразу по
              допущениям.
            </p>
          </div>
          <span className="font-mono text-[13px] text-fg-dim tabular-nums">
            {answered}/{questions.length}
          </span>
        </header>

        <ol className="flex flex-col">
          {questions.map((q, qi) => {
            const c = choices[q.id]
            return (
              <li key={q.id} className="border-b border-line px-6 py-5">
                <div className="mb-3 flex gap-3">
                  <span className="font-mono text-[12px] font-bold text-amber">{q.id}</span>
                  <p className="text-[14.5px] leading-relaxed font-semibold text-fg">{q.text}</p>
                </div>
                <div className="grid gap-2 pl-10">
                  {q.options.map((opt, oi) => {
                    const on = c && 'option' in c && c.option === oi
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setChoices((prev) => ({ ...prev, [q.id]: { option: oi } }))}
                        className={`press flex cursor-pointer items-start gap-3 border px-3.5 py-2.5 text-left ${
                          on ? 'border-brand bg-panel glow-brand' : 'border-line-strong bg-ink hover:border-line-input'
                        }`}
                      >
                        <span className={`mt-[3px] size-3 shrink-0 border ${on ? 'border-brand bg-brand' : 'border-line-input'}`} />
                        <span className="flex-1 text-[13px] leading-snug text-fg-soft">{opt}</span>
                        {oi === q.recommended && <span className="tag shrink-0 text-[9.5px] text-brand-mid">рекомендуется</span>}
                      </button>
                    )
                  })}
                  <input
                    placeholder="Свой ответ…"
                    value={c && 'custom' in c ? c.custom : ''}
                    onChange={(e) =>
                      setChoices((prev) => {
                        const next = { ...prev }
                        if (e.target.value) next[q.id] = { custom: e.target.value }
                        else delete next[q.id]
                        return next
                      })
                    }
                    aria-label={`Свой ответ на ${q.id}`}
                    className="min-h-10 rounded-[2px] border border-line-strong bg-ink px-3.5 text-[13px] text-fg placeholder:text-fg-dim/60 focus:border-brand"
                    tabIndex={0}
                    data-index={qi}
                  />
                </div>
              </li>
            )
          })}
        </ol>

        {error && <p className="px-6 pt-4 font-mono text-[12px] text-hazard">{error}</p>}
        <footer className="flex flex-wrap items-center justify-end gap-3 px-6 py-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => submit(true)}
            className="press tag cursor-pointer border border-line-input px-4 py-3 text-fg-soft hover:border-amber hover:text-amber disabled:opacity-50"
          >
            Пропустить — принять рекомендации
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => submit(false)}
            className="press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[2px] bg-brand px-5 font-display text-[14px] font-semibold text-ink hover:bg-brand-hover disabled:opacity-60"
          >
            {busy ? 'Отправляю…' : `Ответить и продолжить${answered ? ` (${answered})` : ''}`} <span aria-hidden="true">→</span>
          </button>
        </footer>
      </div>
    </div>
  )
}
