from typing import Literal

from pydantic import BaseModel, Field

TaskType = Literal["backend", "frontend", "integration", "db", "qa", "devops"]
RequirementType = Literal["functional", "integration", "nonfunctional"]
SourceKind = Literal["epic", "doc", "proto_rpc", "proto_message", "openapi_op", "example"]
InputRole = Literal["product_docs", "external_docs", "contracts", "examples"]

CONTRACT_OP_KINDS = ("proto_rpc", "openapi_op")


class Source(BaseModel):
    id: str
    kind: SourceKind
    file: str
    title: str
    text: str


class SourceRef(BaseModel):
    id: str
    kind: SourceKind
    file: str
    title: str
    excerpt: str


class Language(BaseModel):
    value: str | None = None
    confidence: float = 0.0
    evidence: list[str] = []


class Requirement(BaseModel):
    id: str
    type: RequirementType
    text: str
    source_refs: list[str] = []


class QuestionDraft(BaseModel):
    text: str
    options: list[str]
    recommended: int = Field(0, description="Индекс рекомендуемого варианта в options")


class Question(QuestionDraft):
    id: str
    answer: str | None = None


class GapEvidence(BaseModel):
    source_id: str
    quote: str = Field(description="Дословная цитата из этого источника")


class GapDraft(BaseModel):
    text: str
    risk: str
    source_refs: list[str] = []
    evidence: list[GapEvidence] = []


class Gap(GapDraft):
    id: str


class TestScenario(BaseModel):
    __test__ = False

    name: str
    input: str
    expected: str


class TaskDraft(BaseModel):
    title: str
    description: str
    type: TaskType
    definition_of_done: list[str] = []
    requirement_ids: list[str] = []
    source_refs: list[str] = []
    test_scenarios: list[TestScenario] = []


class Task(TaskDraft):
    id: str


class StoryDraft(BaseModel):
    title: str
    description: str
    acceptance_criteria: list[str] = []
    requirement_ids: list[str] = []


class Story(StoryDraft):
    id: str
    tasks: list[Task] = []


class CriticNote(BaseModel):
    story_id: str
    problem: str


class RequirementsOut(BaseModel):
    requirements: list[Requirement]


class AnalystOut(BaseModel):
    questions: list[QuestionDraft] = []
    gaps: list[GapDraft] = []


class StoriesOut(BaseModel):
    stories: list[StoryDraft]


class TaskResponse(BaseModel):
    finding_id: str
    status: Literal["fixed", "disputed"]
    note: str = ""


class TasksOut(BaseModel):
    tasks: list[TaskDraft]
    responses: list[TaskResponse] = []


class CriticOut(BaseModel):
    notes: list[CriticNote] = []


Severity = Literal["critical", "high", "medium", "low"]
FindingSource = Literal["reviewer", "editor", "simplifier", "analyst"]
REVIEWER_KINDS = ("criterion_not_covered", "contradicts_decision", "wrong_requirement", "contract_mismatch",
                  "failure_not_handled")
EDITOR_KINDS = ("duplicate", "gap_between_stories")
SIMPLIFIER_KINDS = ("unneeded_task", "reuse_existing", "platform_covers", "merge_tasks")


class Evidence(BaseModel):
    where: Literal["criterion", "decision", "requirement", "source", "task"]
    ref: str = Field("", description="ID истории, требования, источника или задачи; для решения пусто")
    quote: str = Field(description="Дословная цитата из этого места, не короче 10 символов")


class FindingDraft(BaseModel):
    kind: str
    severity: Severity = "medium"
    confidence: int = Field(0, ge=0, le=100)
    story_ids: list[str] = []
    task_ids: list[str] = []
    scenario: str = Field(description="Когда и что пойдёт не так, если оставить как есть")
    evidence: list[Evidence] = []
    fix: str = ""


class ReviewerFinding(FindingDraft):
    kind: Literal[REVIEWER_KINDS]


class EditorFinding(FindingDraft):
    kind: Literal[EDITOR_KINDS]


class SimplifierFinding(FindingDraft):
    kind: Literal[SIMPLIFIER_KINDS]


class Finding(FindingDraft):
    id: str
    source: FindingSource
    round: int = 0
    verdict: Literal["pending", "confirmed", "downgraded", "rejected", "rejected_by_filter", "deferred"] = "pending"
    verdict_reason: str = ""
    resolution: Literal["fixed", "disputed", "resolved", "not_resolved"] | None = None
    resolution_note: str = ""


class ResolutionDraft(BaseModel):
    finding_id: str
    status: Literal["resolved", "not_resolved"]
    note: str = ""


class ReviewerOut(BaseModel):
    resolutions: list[ResolutionDraft] = []
    findings: list[ReviewerFinding] = []


class EditorOut(BaseModel):
    findings: list[EditorFinding] = []


class SimplifierOut(BaseModel):
    findings: list[SimplifierFinding] = []


class VerdictDraft(BaseModel):
    finding_id: str
    verdict: Literal["confirmed", "downgraded", "rejected"]
    severity: Severity | None = None
    reason: str = ""


class SkepticOut(BaseModel):
    verdicts: list[VerdictDraft] = []


class ReviewSkip(BaseModel):
    step: str
    story_id: str | None = None
    reason: str


class Issue(BaseModel):
    code: str
    severity: Literal["error", "warning", "info"]
    target_id: str
    message: str


class Coverage(BaseModel):
    coverage_percent: float = 0.0
    uncovered_requirements: list[str] = []
    requirements_without_stories: list[str] = []
    tasks_without_requirements: list[str] = []
    unknown_refs: list[str] = []
    contract_ops_used: list[str] = []
    contract_ops_unused: list[str] = []
    ops_without_tasks: list[str] = []
    ops_without_tests: list[str] = []


class Stats(BaseModel):
    requirements_count: int = 0
    stories_count: int = 0
    tasks_count: int = 0
    tasks_by_type: dict[str, int] = {}
    questions_count: int = 0
    gaps_count: int = 0
    assumptions_count: int = 0
    issues_count: int = 0


class Epic(BaseModel):
    title: str
    text: str
    label: str


class Decomposition(BaseModel):
    epic: Epic
    target_language: Language = Language()
    sources: list[SourceRef] = []
    requirements: list[Requirement] = []
    stories: list[Story] = []
    questions: list[Question] = []
    assumptions: list[str] = []
    gaps: list[Gap] = []
    issues: list[Issue] = []
    findings: list[Finding] = []
    review_skipped: list[ReviewSkip] = []
    coverage: Coverage = Coverage()
    stats: Stats = Stats()
    model: str = ""
    prompt_versions: dict[str, str] = {}


def epic_label(title: str) -> str:
    slug = "_".join(title.split())
    return f"{slug}_Autogenerate"
