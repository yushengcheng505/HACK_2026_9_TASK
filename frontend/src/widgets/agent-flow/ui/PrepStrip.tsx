import type { ReactNode } from 'react'
import type { RunView, SourceKind } from '@/entities/run'
import { isClosedContour, useHealth } from '@/shared/lib/useHealth'

const count = (view: RunView, kinds: SourceKind[]) => view.sources.filter((s) => kinds.includes(s.kind)).length

interface PlateProps {
  index: number
  title: string
  ready: boolean
  busy: boolean
  value: ReactNode
  sub: ReactNode
  onSelect: () => void
  selected: boolean
}

function Plate({ index, title, ready, busy, value, sub, onSelect, selected }: PlateProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`af-plate ${ready ? 'af-plate-ready' : ''} ${busy ? 'af-plate-busy' : ''} ${selected ? 'af-selected' : ''}`}
      style={{ transitionDelay: `${index * 70}ms` }}
    >
      <span className="af-plate-title">{title}</span>
      <span className="af-plate-value">{ready ? value : <span className="af-skeleton" />}</span>
      <span className="af-plate-sub">{ready ? sub : busy ? 'считается…' : 'ждёт входов'}</span>
    </button>
  )
}

interface PrepStripProps {
  view: RunView
  selected: boolean
  onSelect: () => void
}

/** Подготовка без агентов: код разбирает входы и определяет язык, прежде чем отдать работу конвейеру. */
export function PrepStrip({ view, selected, onSelect }: PrepStripProps) {
  const health = useHealth()
  const parse = view.nodes.parse_inputs.phase
  const lang = view.nodes.detect_language.phase
  const parsed = view.sources.length > 0
  const ops = view.contractOps.length
  const language = view.language
  const confidence = Math.round((language?.confidence ?? 0) * 100)
  const llmHost = health && health !== 'offline' ? health.llm_host : null

  return (
    <section className="af-prep col-start-1 row-start-2 flex items-stretch gap-3 px-5 py-3" aria-label="Подготовка без агентов">
      <div className="flex w-[148px] shrink-0 flex-col justify-center">
        <span className="font-mono text-[10.5px] tracking-[0.16em] text-brand-mid uppercase">00 · Подготовка</span>
        <span className="mt-1 text-[12px] leading-snug text-fg-dim">код, без LLM: разбор входов перед конвейером</span>
      </div>
      <Plate
        index={0}
        title="Источники"
        ready={parsed}
        busy={parse === 'active'}
        value={`${view.sources.length} фрагментов`}
        sub={`эпик ${count(view, ['epic'])} · документы ${count(view, ['doc'])} · примеры ${count(view, ['example'])}`}
        onSelect={onSelect}
        selected={selected}
      />
      <Plate
        index={1}
        title="Контракт API"
        ready={parsed}
        busy={parse === 'active'}
        value={`${ops} операций`}
        sub={`gRPC ${count(view, ['proto_rpc'])} · REST ${count(view, ['openapi_op'])} · сообщений ${count(view, ['proto_message'])}`}
        onSelect={onSelect}
        selected={selected}
      />
      <Plate
        index={2}
        title="Целевой язык"
        ready={Boolean(language)}
        busy={lang === 'active'}
        value={
          <span className="flex items-baseline gap-2">
            {language?.value ?? 'не определён'}
            <span className="font-mono text-[12px] text-fg-dim">{confidence}%</span>
          </span>
        }
        sub={
          <span className="af-confidence" aria-label={`Уверенность ${confidence}%`}>
            <i style={{ transform: `scaleX(${confidence / 100})` }} />
          </span>
        }
        onSelect={onSelect}
        selected={selected}
      />
      <Plate
        index={3}
        title="Модель"
        ready={Boolean(view.model)}
        busy={false}
        value={<span className="truncate">{view.model}</span>}
        sub={llmHost ? (isClosedContour(llmHost) ? 'замкнутый контур' : 'внешний хост') : 'хост не известен'}
        onSelect={onSelect}
        selected={selected}
      />
    </section>
  )
}
