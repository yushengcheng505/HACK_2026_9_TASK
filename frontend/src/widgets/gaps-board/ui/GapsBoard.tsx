import type { RunView } from '@/entities/run'

export function GapsBoard({ view, onShow }: { view: RunView; onShow: (gapId: string) => void }) {
  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-fg">
            Пробелы и противоречия <span className="font-mono text-[11px] font-normal text-hazard">{view.gaps.length}</span>
          </span>
          <p className="max-w-[560px] text-[13px] leading-relaxed text-fg-muted">
            Где эпик, документация и контракт расходятся. Каждый пробел подтверждён минимум двумя источниками.
          </p>
        </div>
      </div>

      {view.gaps.length === 0 && <p className="tag text-fg-dim">Пробелов не найдено{view.status === 'running' ? ' — пока' : ''}</p>}
      <div className="grid gap-3 2xl:grid-cols-2">
        {view.gaps.map((g, i) => (
          <article
            key={g.id}
            className="fx-enter flex flex-col overflow-hidden rounded-xl border border-hazard/35 bg-surface"
            style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
          >
            <div className="flex items-start gap-3 border-b border-line px-4 py-3">
              <span className="shrink-0 rounded-[5px] bg-hazard px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink">{g.id}</span>
              <p className="text-[13.5px] leading-relaxed text-fg">{g.text}</p>
            </div>
            <div className="flex flex-col gap-3 px-4 py-3">
              <p className="text-[12.5px] leading-snug text-hazard/90">
                <span className="tag mr-2 text-[10px] text-hazard">риск</span>
                {g.risk}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {g.source_refs.map((r) => (
                    <span key={r} className="rounded-[5px] bg-ink px-1.5 py-0.5 font-mono text-[11px] text-fg-soft">{r}</span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onShow(g.id)}
                  className="press cursor-pointer rounded-lg border border-hazard/50 px-2.5 py-1 text-[12.5px] font-semibold text-hazard hover:bg-hazard hover:text-ink"
                >
                  На карте →
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {(view.questions.length > 0 || view.assumptions.length > 0) && (
        <section className="mt-8">
          <span className="text-[14px] font-semibold text-fg">Вопросы аналитика и допущения</span>
          <div className="mt-3 flex flex-col gap-px overflow-hidden rounded-xl border border-line bg-line">
            {view.questions.map((q) => (
              <div key={q.id} className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] gap-4 bg-ink px-4 py-3">
                <span className="font-mono text-[12px] font-bold text-amber">{q.id}</span>
                <span className="text-[13px] leading-snug text-fg-soft">{q.text}</span>
                <span className={`text-[13px] leading-snug ${q.answer ? 'text-brand' : 'text-fg-dim'}`}>
                  {q.answer ?? `без ответа → ${q.options[q.recommended] ?? '—'}`}
                </span>
              </div>
            ))}
            {view.assumptions.map((a) => (
              <div key={a} className="grid grid-cols-[64px_minmax(0,1fr)] gap-4 bg-ink px-4 py-3">
                <span className="tag text-[10px] text-fg-dim">допущ.</span>
                <span className="text-[13px] leading-snug text-fg-muted">{a}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
