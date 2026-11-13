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
  /** ID задач, заменённых после замечаний критика — гаснут на карте. */
  retired: { storyId: string; task: Task }[]
  gaps: Gap[]
  questions: Question[]
  waitingAnswers: boolean
  assumptions: string[]
  issues: Issue[]
  coverage: Coverage | null
  stats: Stats | null
  criticRound: number
  criticNotes: { story_id: string; problem: string }[]
  nodes: Record<PipelineNode, NodeState>
  activeNode: PipelineNode | null
  tokens: TokenChunk[]
  log: LogLine[]
  lastSeq: number
  result: Decomposition | null
}
