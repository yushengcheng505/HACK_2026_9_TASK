"""Метрики бенчмарка: стоимость, итог полного прогона, обнаружение и исправление дефектов, побочный ущерб."""

import re
from collections import Counter

from app.checks import run_checks
from app.findings import normalize
from app.schemas import Decomposition, Finding, Requirement, Source, Story, Task

from bench.mutations import Mutation

CONTRADICTION = re.compile(r"15\s*мин", re.I)
# Свои сервисы в демо-эпиках названы *service; внешние операции — из файлов bench.external_contracts демо.
SERVICE = re.compile(r"\b([a-z]+service|frontend|webportal)\b")
CALLS = re.compile(r"клиент|вызов|вызыв", re.I)


def _caller(task: Task, op: str) -> str | None:
    """Сервис, в котором задача реализует вызов внешней операции, если задача об этом."""
    method = op.rsplit(".", 1)[-1] if op.startswith("PROTO:") else op.split(" ", 1)[-1].split("{")[0].rstrip("/")
    if task.type not in ("backend", "integration") or method not in task.title + task.description[:200]:
        return None
    if not CALLS.search(task.title):
        return None
    found = SERVICE.search(task.title) or SERVICE.search(task.description)
    return found.group(1) if found else None


def seams(result: Decomposition, external_files: list[str]) -> dict:
    """Стыки между историями: внешний метод, который вызывают из нескольких сервисов, и требования,
    закрытые только тестами."""
    external = {s.id for s in result.sources if s.file in external_files and s.kind in ("proto_rpc", "openapi_op")}
    callers: dict[str, set[str]] = {}
    for story in result.stories:
        for task in story.tasks:
            for op in task.source_refs:
                if op in external and (svc := _caller(task, op)):
                    callers.setdefault(op, set()).add(svc)
    conflicts = sorted(op for op, svcs in callers.items() if len(svcs) > 1)
    implemented = {r for s in result.stories for t in s.tasks if t.type != "qa" for r in t.requirement_ids}
    tests_only = [r.id for r in result.requirements if r.id not in implemented]
    return {"owner_conflicts": len(conflicts), "conflict_ops": conflicts,
            "tests_only_requirements": len(tests_only)}


def cost(run: dict) -> dict:
    calls = run["calls"]
    return {
        "seconds": run["seconds"],
        "calls": len(calls),
        "calls_by_role": dict(Counter(c["prompt"] for c in calls)),
        "input_kchars": round(sum(c["input_chars"] for c in calls) / 1000, 1),
        "content_kchars": round(sum(c["content_chars"] for c in calls) / 1000, 1),
        "reasoning_kchars": round(sum(c["reasoning_chars"] for c in calls) / 1000, 1),
        "retries": sum(c["retries"] for c in calls),
        "rate_limited": sum(c.get("rate_limited", 0) for c in calls),
        "failed_calls": sum(not c["ok"] for c in calls),
    }


def _events(run: dict, type_: str) -> list[dict]:
    return [e["data"] for e in run["events"] if e["type"] == type_]


def _result(run: dict) -> Decomposition | None:
    return Decomposition.model_validate(run["result"]) if run.get("result") else None


def score_e2e(run: dict, external_files: list[str]) -> dict:
    out = {"error": run["error"], **cost(run)}
    result = _result(run)
    if result is None:
        return out
    gap_findings = [f for f in result.findings if f.source == "analyst" and CONTRADICTION.search(f.scenario)]
    unresolved = [f for f in result.findings if f.source != "analyst" and f.verdict == "confirmed"
                  and f.resolution not in ("fixed", "resolved")]
    return out | {
        "stories": len(result.stories),
        "tasks": result.stats.tasks_count,
        "gaps": len(result.gaps),
        "contradiction_kept": any(CONTRADICTION.search(g.text) for g in result.gaps),
        "contradiction_verdicts": [f.verdict for f in gap_findings],
        "code_errors": sum(i.severity == "error" for i in result.issues),
        "dup_candidates": sum(i.code == "duplicate_task" for i in result.issues),
        "coverage": result.coverage.coverage_percent,
        "findings": len(result.findings),
        "confirmed": sum(f.verdict == "confirmed" for f in result.findings),
        "unresolved": len(unresolved),
        "review_skipped": len(result.review_skipped),
        "tasks_failed": len(_events(run, "tasks_failed")),
        "redo_rounds": len([n for n in _events(run, "critic_feedback") if n["notes"]]),
        "architecture": result.architecture is not None,
        "dup_confirmed": sum(f.kind == "duplicate" and f.verdict == "confirmed" for f in result.findings),
        **seams(result, external_files),
    }


def _finding_text(f: Finding) -> str:
    return normalize(" ".join([f.scenario, f.fix, *f.task_ids, *(e.quote for e in f.evidence)]))


def _matches(f: Finding, m: Mutation, stories: list[Story]) -> bool:
    story_of = {t.id: s.id for s in stories for t in s.tasks}
    in_story = m.story_id in f.story_ids or any(story_of.get(t) == m.story_id for t in f.task_ids)
    by_key = in_story and any(normalize(k) in _finding_text(f) for k in m.keys)
    by_kind = f.kind in m.kinds and (bool(set(f.task_ids) & set(m.task_ids)) or (not m.task_ids and in_story))
    return by_key or by_kind


def score_review(run: dict, mutations: list[Mutation], start_state: dict) -> dict:
    """Обнаружение и исправление каждого дефекта, побочный ущерб относительно стартового состояния."""
    out = {"error": run["error"], **cost(run)}
    result = _result(run)
    start = [Story.model_validate(s) for s in start_state["stories"]]
    final = result.stories if result else [Story.model_validate(s) for s in run["stories"]]
    notes: dict[str, str] = {}
    redone: set[str] = set()
    for fb in _events(run, "critic_feedback"):
        for n in fb["notes"]:
            notes[n["story_id"]] = notes.get(n["story_id"], "") + "\n" + normalize(n["problem"])
            redone.add(n["story_id"])
    removed = [(e["story_id"], t) for e in _events(run, "tasks_removed") for t in e["task_ids"]]
    findings = result.findings if result else []
    review_findings = [f for f in findings if f.source != "analyst"]

    defects = {}
    for m in mutations:
        in_notes = any(normalize(k) in notes.get(m.story_id, "") for k in m.keys)
        by_removal = any(t in m.task_ids for _, t in removed)
        matching = [f for f in review_findings if _matches(f, m, start)]
        confirmed = [f for f in matching if f.verdict == "confirmed"]
        defects[m.id] = {
            "raised": bool(matching) or in_notes,
            "detected": in_notes or by_removal or bool(confirmed),
            "fixed": m.fixed(final),
            "verdicts": [f.verdict for f in matching],
        }

    sources = [Source.model_validate(s) for s in start_state["sources"]]
    reqs = [Requirement.model_validate(r) for r in start_state["requirements"]]
    issues_before, cov_before = run_checks(sources, reqs, start)
    issues_after, cov_after = run_checks(sources, reqs, final)
    mutated_ids = {t for m in mutations for t in m.task_ids}
    return out | {
        "defects": defects,
        "redone_stories": sorted(redone),
        "removed_by_code": [t for _, t in removed],
        "removed_other": [t for _, t in removed if t not in mutated_ids],
        "tasks_before": sum(len(s.tasks) for s in start),
        "tasks_after": sum(len(s.tasks) for s in final),
        "uncovered_delta": len(cov_after.uncovered_requirements) - len(cov_before.uncovered_requirements),
        "ops_without_tasks_delta": len(cov_after.ops_without_tasks) - len(cov_before.ops_without_tasks),
        "errors_delta": sum(i.severity == "error" for i in issues_after)
                        - sum(i.severity == "error" for i in issues_before),
        "findings": len(review_findings),
        "confirmed": sum(f.verdict == "confirmed" for f in review_findings),
        "review_skipped": len(result.review_skipped) if result else None,
    }
