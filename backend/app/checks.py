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
STORY_FORMAT = re.compile(r"^\s*Как\s+.+?,\s*я\s+хочу\s+.+?,\s*чтобы\s+.+", re.I | re.S)


def is_test_task(task: Task) -> bool:
    return task.type == "qa" or bool(task.test_scenarios)


def _stems(title: str) -> set[str]:
    return {w[:6] for w in re.findall(r"\w+", title.lower()) if len(w) > 2}


def _similar(a: set[str], b: set[str]) -> bool:
    return bool(a and b) and len(a & b) / len(a | b) >= DUPLICATE_SIMILARITY


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

    seen: list[tuple[Task, set[str]]] = []
    for task in tasks:
        if not task.requirement_ids:
            issue("task_without_requirement", "error", task.id, "Задача не обоснована ни одним требованием")
        if task.type == "qa" and not task.test_scenarios:
            issue("qa_without_scenarios", "warning", task.id, "Задача на тестирование без тест-сценариев")
        stems = _stems(task.title)
        original = next((t for t, other in seen if _similar(stems, other)), None)
        if original:
            issue("duplicate_task", "warning", task.id,
                  f"Дублирует задачу {original.id} «{original.title}» — убери повтор или уточни отличие")
        else:
            seen.append((task, stems))

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
    tested = {ref for t in tasks if is_test_task(t) for ref in t.source_refs}
    used = [op for op in ops if op in used_by_reqs or op in used_by_tasks]
    ops_without_tasks = [op for op in ops if op in used_by_reqs and op not in used_by_tasks]
    ops_without_tests = [op for op in ops if (op in used_by_reqs or op in used_by_tasks) and op not in tested]
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
        contract_ops_unused=[op for op in ops if op not in used_by_reqs and op not in used_by_tasks],
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
