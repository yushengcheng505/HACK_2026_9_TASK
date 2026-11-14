/** Зеркало backend/app/schemas.py и контракта SSE (docs/superpowers/specs/2026-11-13-backend-mvp-design.md). */

export type SourceKind = 'epic' | 'doc' | 'proto_rpc' | 'proto_message' | 'openapi_op' | 'example'
export type TaskType = 'backend' | 'frontend' | 'integration' | 'db' | 'qa' | 'devops'
export type RequirementType = 'functional' | 'integration' | 'nonfunctional'
export type Severity = 'error' | 'warning' | 'info'
export type RunStatus = 'running' | 'waiting_answers' | 'done' | 'failed'

export interface SourceRef {
  id: string
  kind: SourceKind
  file: string
  title: string
  excerpt: string
}

export interface Language {
  value: string | null
  confidence: number
  evidence: string[]
}

export interface Requirement {
  id: string
  type: RequirementType
  text: string
  source_refs: string[]
}

export interface Question {
  id: string
  text: string
  options: string[]
  recommended: number
  answer: string | null
}

export interface Gap {
  id: string
  text: string
  risk: string
  source_refs: string[]
}

export interface TestScenario {
  name: string
  input: string
  expected: string
}

export interface Task {
  id: string
  title: string
  description: string
  type: TaskType
  definition_of_done: string[]
  requirement_ids: string[]
  source_refs: string[]
  test_scenarios: TestScenario[]
}

export interface Story {
  id: string
  title: string
  description: string
  acceptance_criteria: string[]
  requirement_ids: string[]
  tasks: Task[]
}

export interface Issue {
  code: string
  severity: Severity
  target_id: string
  message: string
}

export interface Coverage {
  coverage_percent: number
  uncovered_requirements: string[]
  requirements_without_stories: string[]
  tasks_without_requirements: string[]
  unknown_refs: string[]
  contract_ops_used: string[]
  contract_ops_unused: string[]
  ops_without_tasks: string[]
  ops_without_tests: string[]
}

export interface Stats {
  requirements_count: number
  stories_count: number
  tasks_count: number
  tasks_by_type: Record<string, number>
  questions_count: number
  gaps_count: number
  assumptions_count: number
  issues_count: number
}

export interface Finding {
  id: string
  source: 'reviewer' | 'editor' | 'simplifier' | 'analyst'
  round: number
  kind: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: number
  story_ids: string[]
  task_ids: string[]
  scenario: string
  evidence: { where: string; ref: string; quote: string }[]
  fix: string
  verdict: 'pending' | 'confirmed' | 'downgraded' | 'rejected' | 'rejected_by_filter' | 'deferred'
  verdict_reason: string
  resolution: 'fixed' | 'disputed' | 'resolved' | 'not_resolved' | null
  resolution_note: string
}

export interface ReviewSkip {
  step: string
  story_id: string | null
  reason: string
}

export interface Decomposition {
  epic: { title: string; text: string; label: string }
  target_language: Language
  sources: SourceRef[]
  requirements: Requirement[]
  stories: Story[]
  questions: Question[]
  assumptions: string[]
  gaps: Gap[]
  issues: Issue[]
  findings?: Finding[]
  review_skipped?: ReviewSkip[]
  coverage: Coverage
  stats: Stats
  model: string
  prompt_versions: Record<string, string>
}

export interface RunRecord {
  id: string
  title: string
  status: RunStatus
  origin: string
  demo_id: string | null
  created_at: number
  updated_at?: number
  model: string | null
  error?: string | null
  questions?: Question[] | null
  result?: Decomposition | null
  stats?: Stats | null
}

export interface RunEvent {
  seq: number
  type: string
  data: Record<string, unknown>
  receivedAt: number
}

export type PipelineNode =
  | 'parse_inputs'
  | 'detect_language'
  | 'requirements'
  | 'analyst'
  | 'ask_user'
  | 'stories'
  | 'tasks'
  | 'checks'
  | 'critic'
  | 'finalize'

export type NodePhase = 'idle' | 'active' | 'done' | 'waiting'

export interface NodeState {
  phase: NodePhase
  summary: string
  visits: number
}

export interface TokenChunk {
  key: number
  node: string
  kind: 'content' | 'reasoning'
  text: string
}

export interface LogLine {
  seq: number
  at: number
  type: string
  text: string
  tone: 'brand' | 'hazard' | 'amber' | 'dim' | 'fg'
}

/** Один вызов модели агентом в одном круге: что он думал и что ответил. */
export interface StreamRun {
  /** Номер захода узла графа (круг доработки для задач и проверки). */
  round: number
  startedAt: number
  lastAt: number
  reasoning: string
  content: string
  /** Начало потока обрезано — храним только хвост. */
  trimmed: boolean
}

/** Всё, что известно о вызовах одного экземпляра агента (`token.node`, например `tasks:US-001`). */
export interface AgentCall {
  runs: StreamRun[]
  retries: { at: number; attempt: number; reason: string }[]
  failure: string | null
}

export interface ReviewTally {
  found: number
  filtered: number
  confirmed: number
  downgraded: number
  rejected: number
}

export interface RunView {
  runId: string
  title: string
  model: string
  status: RunStatus
  startedAt: number | null
  finishedAt: number | null
  error: string | null
  language: Language | null
  sources: SourceRef[]
  contractOps: string[]
  requirements: Requirement[]
  stories: Story[]
  /** ID задач, заменённых после замечаний критика — гаснут на карте. round — заход, в котором их заменили. */
  retired: { storyId: string; task: Task; round: number }[]
  gaps: Gap[]
  questions: Question[]
  waitingAnswers: boolean
  assumptions: string[]
  issues: Issue[]
  coverage: Coverage | null
  stats: Stats | null
  criticRound: number
  criticNotes: { story_id: string; problem: string }[]
  /** Счётчики находок проверяющих и вердиктов скептика по всем кругам. */
  review: ReviewTally
  /** Находки проверяющих и пробелы аналитика с вердиктами скептика и решённостью. */
  findings: Finding[]
  /** Что после каждого круга проверки ушло на доработку. */
  feedback: { round: number; notes: { story_id: string; problem: string }[] }[]
  /** Истории, по которым генераторы задач запущены в текущем заходе. */
  taskTargets: string[]
  /** Вызовы модели по экземплярам агентов, ключ — `token.node`. */
  calls: Record<string, AgentCall>
  nodes: Record<PipelineNode, NodeState>
  activeNode: PipelineNode | null
  tokens: TokenChunk[]
  log: LogLine[]
  lastSeq: number
  result: Decomposition | null
}
