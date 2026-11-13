import { ResultExportActions, type ResultDocument } from '@/features/export-result'
import { DEMO_SUMMARY, type RunFrame } from '@/features/team-run'
import { ResultCard } from './ResultCard'
import { ResultStatusPill } from './ResultStatusPill'
import { ResultSummary } from './ResultSummary'

interface RunResultProps {
  frame: RunFrame
  task: string
}

export function RunResult({ frame, task }: RunResultProps) {
  const exportable: ResultDocument = {
    task,
    sections: frame.agents.map(({ agent, deliverable }) => ({
      title: deliverable.title,
      author: `${agent.name} · ${agent.role}`,
      text: deliverable.text,
    })),
    summary: DEMO_SUMMARY,
  }

  return (
    <section id="result" aria-label="Финальный результат" className="mt-7 rounded-[28px] border border-line bg-panel p-7">
      <div className="mb-[22px] flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[760px] flex-col gap-2">
          <h2 className="m-0 font-display text-[26px] font-semibold">Финальный результат</h2>
          <p className="m-0 text-[15px] leading-[1.5] text-fg-muted">
            <span className="text-fg-dim">Задача:</span> {task}
          </p>
        </div>
        <ResultStatusPill status={frame.resultStatus} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3.5">
        {frame.agents.map((state) => (
          <ResultCard key={state.agent.id} state={state} />
        ))}
      </div>

      <ResultSummary summary={frame.summary} actions={<ResultExportActions result={exportable} />} />
    </section>
  )
}
