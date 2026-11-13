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


class GapDraft(BaseModel):
    text: str
    risk: str
    source_refs: list[str] = []


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


class TasksOut(BaseModel):
    tasks: list[TaskDraft]


class CriticOut(BaseModel):
    notes: list[CriticNote] = []


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
    coverage: Coverage = Coverage()
    stats: Stats = Stats()
    model: str = ""
    prompt_versions: dict[str, str] = {}


def epic_label(title: str) -> str:
    slug = "_".join(title.split())
    return f"{slug}_Autogenerate"
