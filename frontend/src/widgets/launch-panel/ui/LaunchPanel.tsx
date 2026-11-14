import { useEffect, useRef, useState } from 'react'
import type { DemoEpic, InputRole } from '@/features/launch-run'
import { listDemos, startCustom, startDemo } from '@/features/launch-run'
import { navigate } from '@/shared/lib/useHashRoute'
import { LOCAL_TEMPLATES, unwrap } from '../model/templates'
import type { EpicTemplate } from '../model/templates'
import { CustomEpicForm } from './CustomEpicForm'
import type { EpicDraft } from './CustomEpicForm'
import { TeamCrew } from './TeamCrew'
import { TemplateCard } from './TemplateCard'

const CUSTOM = 'custom'

const demoTemplate = (demo: DemoEpic): EpicTemplate => ({
  id: demo.id,
  title: demo.title,
  summary: demo.summary,
  text: unwrap(demo.epic_text),
  tags: ['демо', `${demo.files.length} файлов`],
})

const cardClass = 'rounded-[28px] border border-line bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.45)]'

export function LaunchPanel() {
  const [demos, setDemos] = useState<DemoEpic[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<EpicDraft>({ title: '', text: '' })
  const [skip, setSkip] = useState(false)
  /** Что сейчас запускается: id демо-эпика или CUSTOM. */
  const [launching, setLaunching] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    listDemos()
      .then(setDemos)
      .catch((e: Error) => {
        setDemos([])
        setError(e.message)
      })
  }, [])

  const launch = async (id: string, start: () => Promise<{ run_id: string }>) => {
    setError(null)
    setLaunching(id)
    try {
      const { run_id } = await start()
      navigate({ name: 'run', id: run_id })
    } catch (e) {
      setError((e as Error).message)
      setLaunching(null)
    }
  }

  const launchCustom = (files: Record<InputRole, File[]>) =>
    launch(CUSTOM, () =>
      startCustom({ title: draft.title.trim() || 'Эпик без названия', text: draft.text, skipQuestions: skip, files }),
    )

  const take = (template: EpicTemplate) => {
    setDraft({ title: template.title, text: template.text })
    const field = textareaRef.current
    field?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    field?.focus({ preventScroll: true })
  }

  const templates = [...(demos ?? []).map((demo) => ({ template: demoTemplate(demo), demo })), ...LOCAL_TEMPLATES.map((template) => ({ template, demo: null }))]

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ink xl:overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-8 pt-7 pb-6">
        <h1 className="m-0 font-display text-[clamp(26px,2.6vw,40px)] leading-[1.12] font-semibold tracking-[-0.01em]">
          Новый эпик.
          <br />
          <span className="text-brand">Команда уже на месте.</span>
        </h1>
        <p className="m-0 max-w-[380px] text-[14px] leading-[1.6] text-fg-muted">
          Опишите эпик слева или возьмите готовый шаблон справа. Агенты разложат его на требования, истории и задачи,
          а каждую задачу свяжут с источником.
        </p>
      </header>

      {error && (
        <div className="mx-8 mb-5 rounded-2xl border border-hazard/60 bg-hazard-deep/40 px-4 py-3 font-mono text-[13px] text-hazard">
          {error}
        </div>
      )}

      <div className="grid gap-6 px-8 pb-8 xl:min-h-0 xl:flex-1 xl:grid-cols-2">
        <section className={`${cardClass} overflow-hidden xl:min-h-0`} aria-labelledby="custom-title">
          <div className="h-full p-6 xl:overflow-y-auto">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <h2 id="custom-title" className="font-display text-[19px] font-semibold text-fg">
                Задача для команды
              </h2>
              <TeamCrew ready={draft.text.trim().length > 0} launching={launching !== null} />
            </div>
            <CustomEpicForm
              draft={draft}
              onDraftChange={setDraft}
              skip={skip}
              onSkipChange={setSkip}
              launching={launching !== null}
              onSubmit={launchCustom}
              onError={setError}
              textareaRef={textareaRef}
            />
          </div>
        </section>

        <section className={`${cardClass} flex flex-col overflow-hidden xl:min-h-0`} aria-labelledby="templates-title">
          <div className="flex items-baseline justify-between gap-4 px-6 pt-6 pb-4">
            <h2 id="templates-title" className="font-display text-[19px] font-semibold text-fg">
              Шаблоны эпиков
            </h2>
            <span className="font-mono text-[12px] text-fg-dim">{demos === null ? '…' : `${templates.length} шт.`}</span>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="flex max-h-[720px] flex-col gap-4 overflow-y-auto px-6 pb-8 xl:max-h-none xl:flex-1">
              {demos === null && <div className="h-64 shrink-0 animate-pulse rounded-[22px] border border-line bg-panel" />}
              {templates.map(({ template, demo }) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  files={demo?.files}
                  inForm={draft.text === template.text}
                  launching={launching === template.id}
                  disabled={launching !== null}
                  onTake={() => take(template)}
                  onLaunch={demo ? () => launch(demo.id, () => startDemo(demo.id, skip)) : undefined}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-[28px] bg-linear-to-t from-surface to-transparent" />
          </div>
        </section>
      </div>
    </div>
  )
}
