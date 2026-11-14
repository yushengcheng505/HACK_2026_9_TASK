import type { NodePhase, PipelineNode, RunView } from '@/entities/run'
import { plural } from '@/shared/lib/plural'

export type StageId = 'prep' | 'requirements' | 'stories' | 'tasks' | 'review' | 'result'
export type Tone = 'hazard' | 'amber' | 'brand' | 'dim'

/** Этап «Хода прогона»: несколько узлов конвейера, одно крупное число и подробности по запросу. */
export interface Stage {
  id: StageId
  label: string
  phase: NodePhase
  /** Крупное число этапа; null — ещё нечего показать. */
  value: number | null
  suffix?: string
  unit: string
  badge?: { text: string; tone: Tone }
  /** Подробности: в подсказке при наведении и в инспекторе по клику. */
  rows: [string, string][]
}

const NODES: Record<StageId, PipelineNode[]> = {
  prep: ['parse_inputs', 'detect_language'],
  requirements: ['requirements', 'analyst', 'ask_user'],
  stories: ['stories'],
  tasks: ['tasks'],
  review: ['checks', 'critic'],
  result: ['finalize'],
}
const ORDER = Object.keys(NODES) as StageId[]

const count = (view: RunView, kind: string) => view.sources.filter((s) => s.kind === kind).length
/** Сводки узлов, которые добавляют к числам этапа что-то новое (остальные их повторяют). */
const SUMMARY: Partial<Record<PipelineNode, string>> = { analyst: 'Аналитик', ask_user: 'Вопросы' }
const summaries = (view: RunView, nodes: PipelineNode[]) =>
  nodes.flatMap((n) => (SUMMARY[n] && view.nodes[n].summary ? [[SUMMARY[n], view.nodes[n].summary] as [string, string]] : []))

function phaseOf(view: RunView, id: StageId, reached: number): NodePhase {
  if (view.status === 'done') return 'done'
  const phases = NODES[id].map((n) => view.nodes[n].phase)
  if (phases.includes('waiting')) return 'waiting'
  if (phases.includes('active')) return 'active'
  if (ORDER.indexOf(id) < reached || (phases.includes('done') && !phases.includes('idle'))) return 'done'
  return phases.includes('done') ? 'active' : 'idle'
}

export function stagesOf(view: RunView): Stage[] {
  const reached = ORDER.reduce((last, id, i) => (NODES[id].some((n) => view.nodes[n].phase !== 'idle') ? i : last), -1)
  const tasks = view.stories.flatMap((s) => s.tasks)
  const tests = tasks.filter((t) => t.type === 'qa' || t.test_scenarios.length).length
  const lang = view.language
  const confidence = Math.round((lang?.confidence ?? 0) * 100)
  const coverage = view.coverage?.coverage_percent ?? null
  const errors = view.issues.filter((i) => i.severity === 'error').length
  const ops = view.contractOps.length
  const opsUsed = view.coverage?.contract_ops_used.length ?? 0
  const answered = view.questions.filter((q) => q.answer).length
  const gaps = view.gaps.length
  const stage = (id: StageId, label: string, rest: Omit<Stage, 'id' | 'label' | 'phase'>): Stage => ({
    id,
    label,
    phase: phaseOf(view, id, reached),
    ...rest,
  })

  return [
    stage('prep', 'Подготовка', {
      value: view.sources.length || null,
      unit: plural(view.sources.length, 'фрагмент', 'фрагмента', 'фрагментов'),
      badge: lang?.value ? { text: `${lang.value} · ${confidence}%`, tone: 'dim' } : undefined,
      rows: [
        ['Эпик · документы · примеры', `${count(view, 'epic')} · ${count(view, 'doc')} · ${count(view, 'example')}`],
        ['Операций контракта', String(ops)],
        ['Целевой язык', lang ? `${lang.value ?? 'не определён'} · ${confidence}%` : '—'],
        ...(lang?.evidence.length ? [['Признаки', lang.evidence.join('; ')] as [string, string]] : []),
        ['Модель', view.model || '—'],
      ],
    }),
    stage('requirements', 'Требования', {
      value: view.requirements.length || null,
      unit: plural(view.requirements.length, 'требование', 'требования', 'требований'),
      badge: gaps ? { text: `${gaps} ${plural(gaps, 'пробел', 'пробела', 'пробелов')}`, tone: 'hazard' } : undefined,
      rows: [
        ['Пробелов и противоречий', String(gaps)],
        ['Вопросов аналитика', view.questions.length ? `${view.questions.length}, отвечено ${answered}` : '0'],
        ['Допущений', String(view.assumptions.length)],
        ...summaries(view, NODES.requirements),
      ],
    }),
    stage('stories', 'Истории', {
      value: view.stories.length || null,
      unit: plural(view.stories.length, 'история', 'истории', 'историй'),
      rows: [
        ['Критериев приёмки', String(view.stories.reduce((n, s) => n + s.acceptance_criteria.length, 0))],
        ...summaries(view, NODES.stories),
      ],
    }),
    stage('tasks', 'Задачи', {
      value: tasks.length || null,
      unit: plural(tasks.length, 'задача', 'задачи', 'задач'),
      badge: tests ? { text: `${tests} ${plural(tests, 'тест', 'теста', 'тестов')}`, tone: 'dim' } : undefined,
      rows: [
        ['Из них тестов', String(tests)],
        ['Тест-сценариев', String(tasks.reduce((n, t) => n + t.test_scenarios.length, 0))],
        ['Генераторов', `${view.stories.length}, по одному на историю`],
        ['Заходов', String(view.nodes.tasks.visits)],
        ...summaries(view, NODES.tasks),
      ],
    }),
    stage('review', 'Проверка', {
      value: coverage,
      suffix: '%',
      unit: 'покрытие',
      badge: errors
        ? { text: `${errors} ${plural(errors, 'ошибка', 'ошибки', 'ошибок')}`, tone: 'hazard' }
        : ops && view.coverage
          ? { text: `контракт ${opsUsed}/${ops}`, tone: opsUsed === ops ? 'brand' : 'dim' }
          : undefined,
      rows: [
        ['Замечаний ОТК', `${view.issues.length}, ошибок ${errors}`],
        ['Операций контракта в работе', `${opsUsed} из ${ops}`],
        ['Находок рецензентов', String(view.review.found)],
        ['Скептик: подтвердил · понизил · отклонил', `${view.review.confirmed} · ${view.review.downgraded} · ${view.review.rejected}`],
        ['Кругов доработки', String(view.criticRound)],
        ...summaries(view, NODES.review),
      ],
    }),
    stage('result', 'Итог', {
      value: null,
      unit: view.status === 'done' ? 'готово' : view.status === 'failed' ? 'сбой' : 'собирается',
      rows: [
        ['Требований · историй · задач', `${view.requirements.length} · ${view.stories.length} · ${tasks.length}`],
        ['Покрытие', coverage === null ? '—' : `${coverage}%`],
        ...(view.error ? [['Сбой', view.error] as [string, string]] : []),
        ...summaries(view, NODES.result),
      ],
    }),
  ]
}
