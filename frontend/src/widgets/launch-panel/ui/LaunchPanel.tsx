import { useEffect, useState } from 'react'
import type { DemoEpic } from '@/features/launch-run'
import { listDemos, startDemo } from '@/features/launch-run'
import { SectionHeader } from '@/shared/ui/SectionHeader'
import { navigate } from '@/shared/lib/useHashRoute'
import { DemoCard } from './DemoCard'
import { CustomEpicForm } from './CustomEpicForm'

export function LaunchPanel() {
  const [demos, setDemos] = useState<DemoEpic[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    listDemos()
      .then(setDemos)
      .catch((e: Error) => setError(e.message))
  }, [])

  const launchDemo = async (demo: DemoEpic, skipQuestions: boolean) => {
    setBusy(demo.id)
    try {
      const { run_id } = await startDemo(demo.id, skipQuestions)
      navigate({ name: 'run', id: run_id })
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <SectionHeader index="01" kicker="Запуск" title="Эпик → истории → задачи">
        <p className="max-w-[460px] text-[14px] leading-relaxed text-fg-muted">
          Агент разбирает эпик вместе с документацией и контрактами. Каждая задача получает ссылку на источник,
          а пробелы в контракте видны до разработки.
        </p>
      </SectionHeader>

      {error && (
        <div className="mx-8 mt-6 border border-hazard/60 bg-hazard-deep/40 px-4 py-3 font-mono text-[13px] text-hazard">
          {error}
        </div>
      )}

      <div className="grid gap-px bg-line xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="bg-ink px-8 py-7" aria-labelledby="gallery-title">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 id="gallery-title" className="tag text-fg-dim">
              [ Галерея эпиков ]
            </h2>
            <span className="tag text-fg-dim">{demos ? `${demos.length} шт.` : '—'}</span>
          </div>
          <div className="flex flex-col gap-4">
            {demos === null && !error && <div className="h-56 animate-pulse border border-line bg-surface" />}
            {demos?.map((demo) => (
              <DemoCard key={demo.id} demo={demo} busy={busy === demo.id} onLaunch={(skip) => launchDemo(demo, skip)} />
            ))}
          </div>
        </section>

        <section className="bg-ink px-8 py-7" aria-labelledby="custom-title">
          <h2 id="custom-title" className="tag mb-5 text-fg-dim">
            [ Свой эпик ]
          </h2>
          <CustomEpicForm onError={setError} />
        </section>
      </div>
    </div>
  )
}
