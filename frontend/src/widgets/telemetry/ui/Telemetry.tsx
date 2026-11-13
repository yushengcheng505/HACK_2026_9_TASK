import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { PIPELINE } from '@/entities/run'
import type { LogLine, RunView, TokenChunk } from '@/entities/run'

const TONE: Record<LogLine['tone'], string> = {
  brand: 'text-brand',
  hazard: 'text-hazard',
  amber: 'text-amber',
  dim: 'text-fg-dim',
  fg: 'text-fg-soft',
}

const nodeLabel = (node: string) => {
  const [base, story] = node.split(':')
  const label = PIPELINE.find((p) => p.node === base)?.label ?? base
  return story ? `${label} · ${story}` : label
}

function streamOf(tokens: TokenChunk[]) {
  const last = tokens.at(-1)
  if (!last) return null
  const chunks: TokenChunk[] = []
  for (let i = tokens.length - 1; i >= 0 && chunks.length < 160; i--) {
    if (tokens[i].node === last.node) chunks.unshift(tokens[i])
  }
  return { node: last.node, chunks }
}

function TelemetryImpl({ view }: { view: RunView }) {
  const [manual, setManual] = useState<boolean | null>(null)
  const open = manual ?? view.status !== 'done'
  const streamBox = useRef<HTMLDivElement>(null)
  const logBox = useRef<HTMLDivElement>(null)
  const stream = useMemo(() => streamOf(view.tokens), [view.tokens])
  const live = view.status === 'running'
  const t0 = view.log[0]?.at ?? 0

  useEffect(() => {
    streamBox.current?.scrollTo({ top: streamBox.current.scrollHeight })
  }, [view.tokens])
  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight })
  }, [view.log])

  return (
    <section
      aria-label="Телеметрия"
      className={`grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-px border-t border-line bg-line transition-[height] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
        open ? 'h-[176px]' : 'h-9'
      }`}
    >
      <div className="flex min-h-0 flex-col bg-ink">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-4">
          <button type="button" onClick={() => setManual(!open)} className="press tag cursor-pointer text-fg-dim hover:text-fg">
            {open ? '▾' : '▸'} телеметрия
          </button>
          <span className="tag text-fg-soft">
            [ поток модели{stream ? ` · ${nodeLabel(stream.node)}` : ''} ]
          </span>
          {live && stream && (
            <span className="ml-auto flex items-center gap-2">
              <span className="fx-pulse size-1.5 rounded-full bg-brand" />
              <span className="tag text-brand">генерация</span>
            </span>
          )}
        </div>
        <div ref={streamBox} className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5 font-mono text-[11.5px] leading-[1.55] break-words whitespace-pre-wrap">
          {!stream && <span className="text-fg-dim">Здесь появятся рассуждения и ответ модели — в реальном времени.</span>}
          {stream?.chunks.map((c) => (
            <span key={c.key} className={c.kind === 'reasoning' ? 'text-fg-dim italic' : 'text-mint'}>
              {c.text}
            </span>
          ))}
          {live && stream && <span className="fx-caret" />}
        </div>
      </div>
      <div className="flex min-h-0 flex-col bg-ink">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="tag text-fg-soft">[ журнал событий ]</span>
          <span className="tag text-fg-dim">seq {view.lastSeq}</span>
        </div>
        <div ref={logBox} className="min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-[1.6]">
          {view.log.map((l) => {
            const s = Math.max(0, Math.round((l.at - t0) / 1000))
            return (
              <div key={l.seq} className="flex gap-3">
                <span className="shrink-0 text-fg-dim/60 tabular-nums">
                  +{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
                </span>
                <span className={`min-w-0 truncate ${TONE[l.tone]}`} title={l.text}>
                  {l.text}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export const Telemetry = memo(TelemetryImpl, (a, b) => a.view.tokens === b.view.tokens && a.view.log === b.view.log && a.view.status === b.view.status)
