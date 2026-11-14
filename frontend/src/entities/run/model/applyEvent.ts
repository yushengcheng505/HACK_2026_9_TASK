import type {
  AgentCall,
  Coverage,
  Decomposition,
  Finding,
  Gap,
  Issue,
  Language,
  LogLine,
  NodeState,
  PipelineNode,
  Question,
  Requirement,
  RunEvent,
  RunView,
  SourceRef,
  Stats,
  Story,
  Task,
} from './types'

export const PIPELINE: readonly { node: PipelineNode; label: string; short: string }[] = [
  { node: 'parse_inputs', label: 'Разбор входов', short: 'Разбор' },
  { node: 'detect_language', label: 'Целевой язык', short: 'Язык' },
  { node: 'requirements', label: 'Требования', short: 'REQ' },
  { node: 'analyst', label: 'Аналитик', short: 'Аналитик' },
  { node: 'ask_user', label: 'Вопросы', short: 'Вопросы' },
  { node: 'stories', label: 'Истории', short: 'US' },
  { node: 'tasks', label: 'Задачи', short: 'TASK' },
  { node: 'checks', label: 'ОТК', short: 'ОТК' },
  { node: 'critic', label: 'Критик', short: 'Критик' },
  { node: 'finalize', label: 'Сборка', short: 'Сборка' },
]

const TOKEN_LIMIT = 600
const LOG_LIMIT = 400
/** Сколько символов потока храним на один вызов агента (рассуждение и ответ отдельно). */
const STREAM_LIMIT = 40_000

/** Узел графа, в котором работает экземпляр агента: по нему считаем круг. */
export function phaseOfCall(node: string): PipelineNode {
  const base = node.split(':')[0]
  if (base === 'requirements' || base === 'analyst' || base === 'stories' || base === 'tasks') return base
  if (node === 'skeptic:gaps') return 'analyst'
  return 'critic'
}

const emptyCall = (): AgentCall => ({ runs: [], retries: [], failure: null })

function patchCall(view: RunView, node: string, patch: (call: AgentCall) => AgentCall): RunView['calls'] {
  return { ...view.calls, [node]: patch(view.calls[node] ?? emptyCall()) }
}

function appendStream(view: RunView, node: string, kind: 'content' | 'reasoning', text: string, at: number): RunView['calls'] {
  const round = view.nodes[phaseOfCall(node)].visits
  return patchCall(view, node, (call) => {
    const last = call.runs.at(-1)
    const run =
      last && last.round === round
        ? { ...last }
        : { round, startedAt: at, lastAt: at, reasoning: '', content: '', trimmed: false }
    let next = run[kind] + text
    if (next.length > STREAM_LIMIT) {
      next = next.slice(-STREAM_LIMIT)
      run.trimmed = true
    }
    run[kind] = next
    run.lastAt = at
    const runs = last && last.round === round ? [...call.runs.slice(0, -1), run] : [...call.runs, run]
    return { ...call, runs }
  })
}

/** Ключ экземпляра агента для пропущенного шага проверки. */
function skippedCallKey(step: string, storyId: string | null): string {
  if ((step === 'reviewer' || step === 'resolution') && storyId) return `review:${storyId}`
  if (step === 'editor') return 'junction'
  return step
}

function mergeFindings(current: Finding[], incoming: Finding[]): Finding[] {
  const known = new Set(current.map((f) => f.id))
  return [...current, ...incoming.filter((f) => !known.has(f.id))]
}

function idleNodes(): Record<PipelineNode, NodeState> {
  return Object.fromEntries(PIPELINE.map(({ node }) => [node, { phase: 'idle', summary: '', visits: 0 }])) as Record<
    PipelineNode,
    NodeState
  >
}

export function emptyRun(runId: string): RunView {
  return {
    runId,
    title: '',
    model: '',
    concurrency: null,
    status: 'running',
    startedAt: null,
    finishedAt: null,
    error: null,
    language: null,
    sources: [],
    contractOps: [],
    requirements: [],
    stories: [],
    retired: [],
    gaps: [],
    questions: [],
    waitingAnswers: false,
    assumptions: [],
    issues: [],
    coverage: null,
    stats: null,
    criticRound: 0,
    criticNotes: [],
    review: { found: 0, filtered: 0, confirmed: 0, downgraded: 0, rejected: 0 },
    findings: [],
    feedback: [],
    taskTargets: [],
    calls: {},
    nodes: idleNodes(),
    activeNode: null,
    tokens: [],
    log: [],
    lastSeq: 0,
    result: null,
  }
}

function setNode(view: RunView, node: PipelineNode, patch: Partial<NodeState>): RunView['nodes'] {
  return { ...view.nodes, [node]: { ...view.nodes[node], ...patch } }
}

function line(e: RunEvent, text: string, tone: LogLine['tone'] = 'fg'): LogLine {
  return { seq: e.seq, at: e.receivedAt, type: e.type, text, tone }
}

function pushLog(view: RunView, entry: LogLine): LogLine[] {
  const log = view.log.length >= LOG_LIMIT ? view.log.slice(-LOG_LIMIT + 1) : view.log.slice()
  log.push(entry)
  return log
}

function isPipelineNode(value: unknown): value is PipelineNode {
  return PIPELINE.some((p) => p.node === value)
}

export function applyEvent(view: RunView, e: RunEvent): RunView {
  if (e.seq <= view.lastSeq) return view
  const next: RunView = { ...view, lastSeq: e.seq }
  const d = e.data

  switch (e.type) {
    case 'run_started': {
      const epic = d.epic as { title: string }
      return {
        ...next,
        title: epic.title,
        model: (d.model as string) ?? '',
        concurrency: (d.concurrency as number | undefined) ?? null,
        startedAt: view.startedAt ?? e.receivedAt,
        status: 'running',
        log: pushLog(view, line(e, `Запуск ${d.run_id as string} · модель ${(d.model as string) ?? '—'}`, 'brand')),
      }
    }
    case 'node_started': {
      const node = d.node as string
      if (!isPipelineNode(node)) return next
      return {
        ...next,
        activeNode: node,
        taskTargets: node === 'tasks' ? ((d.stories as string[] | undefined) ?? []) : view.taskTargets,
        // Узел уже активен — его перезапустили после паузы: это тот же заход, а не новый.
        nodes: setNode(view, node, { phase: 'active', visits: view.nodes[node].visits + (view.nodes[node].phase === 'active' ? 0 : 1) }),
        log: pushLog(view, line(e, `>>> ${d.label as string}`, 'fg')),
      }
    }
    case 'node_finished': {
      const node = d.node as string
      if (!isPipelineNode(node)) return next
      return {
        ...next,
        activeNode: view.activeNode === node ? null : view.activeNode,
        nodes: setNode(view, node, { phase: 'done', summary: (d.summary as string) ?? '' }),
        log: pushLog(view, line(e, `✓ ${d.label as string}: ${(d.summary as string) ?? ''}`, 'dim')),
      }
    }
    case 'sources_parsed':
      return {
        ...next,
        sources: d.sources as SourceRef[],
        contractOps: d.contract_ops as string[],
        log: pushLog(view, line(e, `Фрагментов: ${(d.sources as unknown[]).length}, операций контракта: ${(d.contract_ops as unknown[]).length}`)),
      }
    case 'language_detected': {
      const lang = d as unknown as Language
      return {
        ...next,
        language: lang,
        log: pushLog(view, line(e, `Язык: ${lang.value ?? 'не определён'} (${lang.confidence})`)),
      }
    }
    case 'token': {
      const tokens = view.tokens.length >= TOKEN_LIMIT ? view.tokens.slice(-TOKEN_LIMIT + 1) : view.tokens.slice()
      const node = d.node as string
      const kind = d.kind as 'content' | 'reasoning'
      tokens.push({ key: e.seq, node, kind, text: d.text as string })
      return { ...next, tokens, calls: appendStream(view, node, kind, d.text as string, e.receivedAt) }
    }
    case 'requirement_created': {
      const r = d.requirement as Requirement
      return {
        ...next,
        requirements: [...view.requirements, r],
        log: pushLog(view, line(e, `${r.id} ${r.text}`)),
      }
    }
    case 'gap_found': {
      const g = d.gap as Gap
      return { ...next, gaps: [...view.gaps, g], log: pushLog(view, line(e, `${g.id} ${g.text}`, 'hazard')) }
    }
    case 'run_paused':
      return { ...next, status: 'paused', log: pushLog(view, line(e, 'Пауза: прогон остановлен, состояние сохранено', 'amber')) }
    case 'run_resumed':
      return {
        ...next,
        status: 'running',
        concurrency: (d.concurrency as number | undefined) ?? view.concurrency,
        log: pushLog(view, line(e, 'Продолжение с последнего сохранённого шага', 'brand')),
      }
    case 'concurrency_changed':
      return {
        ...next,
        concurrency: d.concurrency as number,
        log: pushLog(view, line(e, `Параллельных запросов к модели: ${d.concurrency as number}`)),
      }
    case 'questions_asked':
      return { ...next, questions: d.questions as Question[] }
    case 'waiting_answers':
      return {
        ...next,
        status: 'waiting_answers',
        waitingAnswers: true,
        questions: d.questions as Question[],
        activeNode: 'ask_user',
        nodes: setNode(view, 'ask_user', { phase: 'waiting', visits: 1 }),
        log: pushLog(view, line(e, 'Граф на паузе: ждём ответов аналитику', 'amber')),
      }
    case 'answers_received': {
      const answers = d.answers as Record<string, string>
      const count = Object.keys(answers).length
      return {
        ...next,
        status: 'running',
        waitingAnswers: false,
        assumptions: d.assumptions as string[],
        language: (d.language as Language) ?? view.language,
        questions: view.questions.map((q) => ({ ...q, answer: answers[q.id] ?? null })),
        nodes: setNode(view, 'ask_user', {
          phase: 'done',
          visits: 1,
          summary: count ? `Ответов: ${count}` : 'Пропущено — по допущениям',
        }),
        log: pushLog(view, line(e, `Ответов: ${count}, допущений: ${(d.assumptions as unknown[]).length}`, 'brand')),
      }
    }
    case 'story_created': {
      const s = { ...(d.story as Omit<Story, 'tasks'>), tasks: [] } as Story
      return { ...next, stories: [...view.stories, s], log: pushLog(view, line(e, `${s.id} ${s.title}`)) }
    }
    case 'tasks_replaced': {
      const storyId = d.story_id as string
      const story = view.stories.find((s) => s.id === storyId)
      return {
        ...next,
        retired: [...view.retired, ...(story?.tasks ?? []).map((task) => ({ storyId, task, round: view.nodes.tasks.visits }))],
        stories: view.stories.map((s) => (s.id === storyId ? { ...s, tasks: [] } : s)),
        log: pushLog(view, line(e, `${storyId}: задачи переделываются по замечаниям`, 'amber')),
      }
    }
    case 'task_created': {
      const storyId = d.story_id as string
      const task = d.task as Task
      return {
        ...next,
        stories: view.stories.map((s) => (s.id === storyId ? { ...s, tasks: [...s.tasks, task] } : s)),
        log: pushLog(view, line(e, `${task.id} [${task.type}] ${task.title}`, 'dim')),
      }
    }
    case 'tasks_failed':
      return {
        ...next,
        calls: patchCall(view, `tasks:${d.story_id as string}`, (c) => ({ ...c, failure: d.error as string })),
        log: pushLog(view, line(e, `${d.story_id as string}: модель не дала задачи — ${d.error as string}`, 'hazard')),
      }
    case 'llm_retry':
      return {
        ...next,
        calls: patchCall(view, d.node as string, (c) => ({
          ...c,
          retries: [...c.retries, { at: e.receivedAt, attempt: d.attempt as number, reason: d.reason as string }],
        })),
        log: pushLog(view, line(e, `${d.node as string}: повтор запроса, попытка ${d.attempt as number} — ${d.reason as string}`, 'amber')),
      }
    case 'findings_collected': {
      const found = d.findings as Finding[]
      const filtered = found.filter((f) => f.verdict === 'rejected_by_filter').length
      const round = d.round as number
      return {
        ...next,
        findings: mergeFindings(view.findings, found),
        review: { ...view.review, found: view.review.found + found.length, filtered: view.review.filtered + filtered },
        log: pushLog(view, line(e, `${round ? `Проверка, круг ${round}` : 'Пробелы'}: находок ${found.length}, отсеяно фильтром ${filtered}`, 'dim')),
      }
    }
    case 'findings_judged': {
      const verdicts = d.verdicts as { id: string; verdict: Finding['verdict']; severity: Finding['severity']; reason: string }[]
      const count = (v: string) => verdicts.filter((x) => x.verdict === v).length
      const byId = new Map(verdicts.map((v) => [v.id, v]))
      const text = `Скептик: подтверждено ${count('confirmed')}, понижено ${count('downgraded')}, отклонено ${count('rejected')}`
      return {
        ...next,
        findings: view.findings.map((f) => {
          const v = byId.get(f.id)
          return v ? { ...f, verdict: v.verdict, severity: v.severity, verdict_reason: v.reason } : f
        }),
        review: {
          ...view.review,
          confirmed: view.review.confirmed + count('confirmed'),
          downgraded: view.review.downgraded + count('downgraded'),
          rejected: view.review.rejected + count('rejected'),
        },
        log: pushLog(view, line(e, d.error ? `${text} (скептик не ответил)` : text, d.error ? 'hazard' : 'brand')),
      }
    }
    case 'findings_resolution': {
      const items = d.items as { id: string; resolution: Finding['resolution']; note: string }[]
      const open = items.filter((i) => i.resolution === 'not_resolved').length
      const byId = new Map(items.map((i) => [i.id, i]))
      return {
        ...next,
        findings: view.findings.map((f) => {
          const r = byId.get(f.id)
          return r ? { ...f, resolution: r.resolution, resolution_note: r.note } : f
        }),
        log: pushLog(view, line(e, `Решённость: проверено ${items.length}, не решено ${open}`, open ? 'amber' : 'brand')),
      }
    }
    case 'tasks_removed': {
      const storyId = d.story_id as string
      const removed = new Set(d.task_ids as string[])
      return {
        ...next,
        stories: view.stories.map((s) => (s.id === storyId ? { ...s, tasks: s.tasks.filter((t) => !removed.has(t.id)) } : s)),
        log: pushLog(view, line(e, `${storyId}: удалено кодом ${[...removed].join(', ')} по ${d.finding_id as string}`, 'amber')),
      }
    }
    case 'review_skipped':
      return {
        ...next,
        calls: patchCall(view, skippedCallKey(d.step as string, (d.story_id as string | null) ?? null), (c) => ({
          ...c,
          failure: d.reason as string,
        })),
        log: pushLog(view, line(e, `Не проверено: ${d.step as string}${d.story_id ? ` ${d.story_id as string}` : ''} — ${d.reason as string}`, 'hazard')),
      }
    case 'checks_finished': {
      const issues = d.issues as Issue[]
      const coverage = d.coverage as Coverage
      const errors = issues.filter((i) => i.severity === 'error').length
      return {
        ...next,
        issues,
        coverage,
        log: pushLog(
          view,
          line(e, `ОТК: замечаний ${issues.length}, ошибок ${errors}, покрытие ${coverage.coverage_percent}%`, errors ? 'hazard' : 'brand'),
        ),
      }
    }
    case 'critic_feedback': {
      const notes = d.notes as { story_id: string; problem: string }[]
      return {
        ...next,
        criticRound: d.round as number,
        criticNotes: notes,
        feedback: [...view.feedback.filter((f) => f.round !== (d.round as number)), { round: d.round as number, notes }],
        log: pushLog(
          view,
          line(e, notes.length ? `Критик, круг ${d.round as number}: на доработку ${notes.length}` : 'Критик: замечаний нет', notes.length ? 'amber' : 'brand'),
        ),
      }
    }
    case 'run_finished':
      return {
        ...next,
        status: 'done',
        activeNode: null,
        finishedAt: view.finishedAt ?? e.receivedAt,
        stats: d.stats as Stats,
        coverage: (d.coverage as Coverage) ?? view.coverage,
        log: pushLog(view, line(e, 'Декомпозиция собрана', 'brand')),
      }
    case 'run_failed':
      return {
        ...next,
        status: 'failed',
        activeNode: null,
        error: d.error as string,
        finishedAt: e.receivedAt,
        log: pushLog(view, line(e, `Сбой: ${d.error as string}`, 'hazard')),
      }
    case 'result_edited':
      return {
        ...next,
        stats: d.stats as Stats,
        coverage: d.coverage as Coverage,
        issues: d.issues as Issue[],
        log: pushLog(view, line(e, 'Правки сохранены, проверки пересчитаны', 'brand')),
      }
    default:
      return next
  }
}

/** Полный результат с бэкенда — источник истины после завершения или правок. */
export function withResult(view: RunView, result: Decomposition): RunView {
  return {
    ...view,
    result,
    title: result.epic.title,
    model: result.model || view.model,
    language: result.target_language,
    sources: result.sources,
    requirements: result.requirements,
    stories: result.stories,
    gaps: result.gaps,
    questions: result.questions,
    assumptions: result.assumptions,
    issues: result.issues,
    coverage: result.coverage,
    stats: result.stats,
    findings: result.findings?.length ? result.findings : view.findings,
  }
}
