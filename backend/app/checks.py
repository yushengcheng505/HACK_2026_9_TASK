"""Проверки кодом («ОТК»): ссылки, связи, дубли, формат историй, покрытие требований и контракта."""

import re
from collections import Counter

from app.schemas import (
    CONTRACT_OP_KINDS,
    Coverage,
    Gap,
    Issue,
    Question,
    Requirement,
    Source,
    Stats,
    Story,
    Task,
)

DUPLICATE_SIMILARITY = 0.7
SHARED_IDENT_SIMILARITY = 0.3
STORY_FORMAT = re.compile(r"^\s*Как\s+.+?,\s*я\s+хочу,?\s+.+?,\s*чтобы\s+.+", re.I | re.S)
IDENT = re.compile(r"[A-Za-z][A-Za-z0-9_.\-/{}]*[A-Za-z0-9_}]")
COMMON_IDENTS = {"api", "courier", "grpc", "rpc", "rest", "http", "json", "get", "post", "put", "patch", "delete",
                 "frontend", "backend", "postgresql", "redis", "kubernetes", "loki", "go"}
TYPE_GROUPS = {"integration": "backend"}


def is_test_task(task: Task) -> bool:
    return task.type == "qa" or bool(task.test_scenarios)


def _stems(title: str) -> set[str]:
    return {w[:6] for w in re.findall(r"\w+", title.lower()) if len(w) > 2}


def _idents(title: str) -> set[tuple[str | None, str]]:
    """Технические объекты из названия: (сервис или None, метод/таблица/файл/путь/секрет)."""
    result = set()
    for token in IDENT.findall(title):
        token = token.lower()
        head, _, tail = token.partition(".")
        service = head if head.endswith("service") and tail else None
        name = tail if service else token
        if not name.endswith("service") and name not in COMMON_IDENTS:
            result.add((service, name))
    return result


def _share_ident(a: set[tuple[str | None, str]], b: set[tuple[str | None, str]]) -> bool:
    return any(na == nb and (sa is None or sb is None or sa == sb) for sa, na in a for sb, nb in b)


def _op_name(op_id: str) -> str:
    """«PROTO:CourierService.PrintLabel» → «printlabel», «API:GET /v1/x/{id}» → «/v1/x/{id}»."""
    body = op_id.split(":", 1)[-1]
    return (body.split(" ", 1)[-1] if " " in body else body.rsplit(".", 1)[-1]).lower()


def _jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def _duplicates(a: Task, b: Task) -> bool:
    if TYPE_GROUPS.get(a.type, a.type) != TYPE_GROUPS.get(b.type, b.type):
        return False
    similarity = _jaccard(_stems(a.title), _stems(b.title))
    ids_a, ids_b = _idents(a.title), _idents(b.title)
    if ids_a and ids_b:
        return _share_ident(ids_a, ids_b) and similarity >= SHARED_IDENT_SIMILARITY
    return similarity >= DUPLICATE_SIMILARITY


def run_checks(sources: list[Source], requirements: list[Requirement], stories: list[Story]) -> tuple[list[Issue], Coverage]:
    issues: list[Issue] = []
    source_ids = {s.id for s in sources}
    req_ids = {r.id for r in requirements}
    tasks = [t for s in stories for t in s.tasks]

    def issue(code: str, severity: str, target: str, message: str) -> None:
        issues.append(Issue(code=code, severity=severity, target_id=target, message=message))

    unknown_refs: list[str] = []
    for owner_id, refs in [(r.id, r.source_refs) for r in requirements] + [(t.id, t.source_refs) for t in tasks]:
        for ref in refs:
            if ref not in source_ids:
                unknown_refs.append(f"{owner_id}: {ref}")
                issue("unknown_source", "error", owner_id,
                      f"Ссылка на несуществующий источник «{ref}» — выдуманный API или документ")
    for owner_id, refs in [(s.id, s.requirement_ids) for s in stories] + [(t.id, t.requirement_ids) for t in tasks]:
        for ref in refs:
            if ref not in req_ids:
                issue("unknown_requirement", "error", owner_id, f"Ссылка на несуществующее требование «{ref}»")

    for story in stories:
        if not STORY_FORMAT.match(story.title):
            issue("story_format", "warning", story.id, "История не в формате «Как <роль>, я хочу <действие>, чтобы <ценность>»")
        if not story.acceptance_criteria:
            issue("story_without_criteria", "warning", story.id, "У истории нет критериев приёмки")
        if not story.tasks:
            issue("story_without_tasks", "error", story.id, "У истории нет технических задач")

    task_story = {t.id: s.id for s in stories for t in s.tasks}
    seen: list[Task] = []
    for task in tasks:
        if not task.requirement_ids:
            issue("task_without_requirement", "error", task.id, "Задача не обоснована ни одним требованием")
        if task.type == "qa" and not task.test_scenarios:
            issue("qa_without_scenarios", "warning", task.id, "Задача на тестирование без тест-сценариев")
        original = next((t for t in seen if _duplicates(t, task)), None)
        if original:
            issue("duplicate_task", "warning", task.id,
                  f"Возможный дубль задачи {original.id} ({task_story[original.id]}) «{original.title}» — "
                  "если это одна работа, оставь её в одной истории; если нет, уточни отличие в названии")
        else:
            seen.append(task)

    reqs_in_stories = {r for s in stories for r in s.requirement_ids}
    reqs_in_tasks = {r for t in tasks for r in t.requirement_ids}
    without_stories = [r.id for r in requirements if r.id not in reqs_in_stories]
    uncovered = [r.id for r in requirements if r.id not in reqs_in_tasks]
    for rid in without_stories:
        issue("requirement_without_story", "warning", rid, "Требование не вошло ни в одну историю")
    for rid in uncovered:
        issue("requirement_without_tasks", "warning", rid, "Требование не покрыто ни одной задачей")

    ops = [s.id for s in sources if s.kind in CONTRACT_OP_KINDS]
    used_by_reqs = {ref for r in requirements for ref in r.source_refs}
    used_by_tasks = {ref for t in tasks for ref in t.source_refs}
    named_by_tasks = {op for t in tasks for op in t.source_refs if _op_name(op) in t.title.lower()}
    tested = {ref for t in tasks if is_test_task(t) for ref in t.source_refs}
    used = [op for op in ops if op in used_by_reqs or op in named_by_tasks]
    ops_without_tasks = [op for op in used if op not in used_by_tasks]
    ops_without_tests = [op for op in used if op not in tested]
    for op in ops_without_tasks:
        issue("op_without_tasks", "error", op, "Операция контракта нужна требованиям, но нет задачи на её реализацию")
    for op in ops_without_tests:
        issue("op_without_tests", "warning", op, "Для операции контракта нет задачи на интеграционный тест")

    coverage = Coverage(
        coverage_percent=round(100 * (len(requirements) - len(uncovered)) / len(requirements), 1) if requirements else 0.0,
        uncovered_requirements=uncovered,
        requirements_without_stories=without_stories,
        tasks_without_requirements=[t.id for t in tasks if not t.requirement_ids],
        unknown_refs=unknown_refs,
        contract_ops_used=used,
        contract_ops_unused=[op for op in ops if op not in used],
        ops_without_tasks=ops_without_tasks,
        ops_without_tests=ops_without_tests,
    )
    return issues, coverage


def compute_stats(requirements: list[Requirement], stories: list[Story], questions: list[Question],
                  gaps: list[Gap], assumptions: list[str], issues: list[Issue]) -> Stats:
    tasks = [t for s in stories for t in s.tasks]
    return Stats(
        requirements_count=len(requirements),
        stories_count=len(stories),
        tasks_count=len(tasks),
        tasks_by_type=dict(Counter(t.type for t in tasks)),
        questions_count=len(questions),
        gaps_count=len(gaps),
        assumptions_count=len(assumptions),
        issues_count=len(issues),
    )
