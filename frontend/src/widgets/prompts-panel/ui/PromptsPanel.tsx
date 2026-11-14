import { useEffect, useState } from 'react'
import type { PromptInfo } from '@/features/edit-prompts'
import { listPrompts, resetPrompt, savePrompt } from '@/features/edit-prompts'
import { SectionHeader } from '@/shared/ui/SectionHeader'

const ROLES: Record<string, string> = {
  requirements: 'Составитель требований',
  analyst: 'Аналитик',
  stories: 'Автор историй',
  tasks: 'Генератор задач',
  reviewer: 'Рецензент',
  junction: 'Редактор стыков',
  simplifier: 'Упрощатель',
  skeptic: 'Скептик',
  critic: 'Критик · старый режим',
}

export function PromptsPanel() {
  const [prompts, setPrompts] = useState<PromptInfo[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = prompts?.find((p) => p.name === selected) ?? null
  const dirty = current !== null && draft !== current.text

  useEffect(() => {
    listPrompts()
      .then((all) => {
        const order = Object.keys(ROLES)
        const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length)
        const list = [...all].sort((a, b) => rank(a.name) - rank(b.name))
        setPrompts(list)
        if (list[0]) {
          setSelected(list[0].name)
          setDraft(list[0].text)
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const pick = (p: PromptInfo) => {
    if (dirty && !window.confirm('Есть несохранённые правки. Уйти без сохранения?')) return
    setSelected(p.name)
    setDraft(p.text)
    setError(null)
  }

  const apply = async (action: () => Promise<PromptInfo>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await action()
      setPrompts((list) => list?.map((p) => (p.name === next.name ? next : p)) ?? null)
      setDraft(next.text)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:overflow-hidden">
      <SectionHeader index="04" kicker="Промпты" title="Системные промпты">
        <span className="max-w-[360px] text-[13px] leading-relaxed text-fg-dim">
          Правка действует на следующие прогоны. Версия промпта записывается в каждый прогон.
        </span>
      </SectionHeader>

      <div className="grid gap-6 px-8 py-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-1.5 lg:overflow-y-auto" aria-label="Промпты">
          {prompts === null && !error && <div className="h-40 animate-pulse rounded-xl border border-line bg-panel" />}
          {prompts?.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => pick(p)}
              className={`press flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left transition-colors duration-150 ${
                p.name === selected ? 'border-brand/70 bg-brand-deep/25' : 'border-transparent hover:border-line-strong hover:bg-surface'
              }`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-semibold text-fg">{ROLES[p.name] ?? p.name}</span>
                <span className="font-mono text-[11px] text-fg-dim">{p.name}.md</span>
              </span>
              {p.overridden && <span className="size-2 shrink-0 rounded-full bg-amber" title="изменён" />}
            </button>
          ))}
        </nav>

        {current ? (
          <section className="flex min-h-[520px] flex-col gap-3 rounded-xl border border-line bg-surface p-5 lg:min-h-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="font-display text-[17px] font-semibold text-fg">{ROLES[current.name] ?? current.name}</h2>
              <span className="font-mono text-[11px] text-fg-dim">версия {current.version}</span>
              {current.overridden && <span className="rounded-full bg-amber-deep px-2.5 py-0.5 font-mono text-[11px] text-amber">изменён</span>}
              <span className="ml-auto font-mono text-[11px] text-fg-dim">{draft.length} симв.</span>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              aria-label={`Промпт ${current.name}`}
              className="min-h-[420px] w-full flex-1 resize-none rounded-lg border border-line-input bg-ink px-4 py-3.5 font-mono text-[13px] leading-[1.65] text-fg-soft focus:border-brand lg:min-h-0"
            />
            {error && <p className="font-mono text-[12px] text-hazard">{error}</p>}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={!dirty || busy || !draft.trim()}
                onClick={() => apply(() => savePrompt(current.name, draft))}
                className="press cursor-pointer rounded-full bg-brand px-5 py-2.5 font-display text-[13px] font-semibold text-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Сохранить
              </button>
              {dirty && (
                <button
                  type="button"
                  onClick={() => setDraft(current.text)}
                  className="press cursor-pointer rounded-full px-4 py-2.5 text-[13px] text-fg-dim hover:text-fg"
                >
                  Отменить правки
                </button>
              )}
              {current.overridden && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => apply(() => resetPrompt(current.name))}
                  className="press ml-auto cursor-pointer rounded-full border border-line-input px-4 py-2.5 text-[13px] text-fg-soft hover:border-amber hover:text-amber disabled:opacity-50"
                >
                  Сбросить к исходному
                </button>
              )}
            </div>
          </section>
        ) : (
          error && <p className="font-mono text-[13px] text-hazard">{error}</p>
        )}
      </div>
    </div>
  )
}
