"""Находки проверки: фильтр доказательств, сортировка, вердикты, план применения. Без LLM."""

import re
from dataclasses import dataclass

from app.checks import is_test_task
from app.schemas import (
    CONTRACT_OP_KINDS,
    Evidence,
    Finding,
    GapDraft,
    Issue,
    Requirement,
    Source,
    Story,
    Task,
    VerdictDraft,
)

MIN_CONFIDENCE = 80
MIN_QUOTE = 10
LIMITS = {"reviewer": 5, "editor": 7, "simplifier": 7}
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
NEEDS_TASK = {"contradicts_decision", "wrong_requirement", "duplicate", "merge_tasks", "unneeded_task",
              "reuse_existing", "platform_covers"}
NEEDS_TWO_TASKS = {"duplicate", "merge_tasks"}
REMOVAL_KINDS = {"duplicate", "unneeded_task", "reuse_existing"}
QUOTES = str.maketrans({"«": '"', "»": '"', "“": '"', "”": '"', "„": '"', "'": '"', "ё": "е"})


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().translate(QUOTES)).strip()


def task_text(task: Task) -> str:
    scenarios = [f"{s.name} {s.input} {s.expected}" for s in task.test_scenarios]
    return "\n".join([task.title, task.description, *task.definition_of_done, *scenarios])


@dataclass
class ReviewContext:
    stories: list[Story]
    requirements: list[Requirement]
    sources: list[Source]
    decisions: str

    def task_index(self) -> dict[str, tuple[Story, Task]]:
        return {t.id: (s, t) for s in self.stories for t in s.tasks}

    def texts(self, where: str) -> dict[str, str]:
        if where == "criterion":
            return {s.id: "\n".join(s.acceptance_criteria) for s in self.stories}
        if where == "requirement":
            return {r.id: r.text for r in self.requirements}
        if where == "source":
            return {s.id: f"{s.title}\n{s.text}" for s in self.sources}
        if where == "task":
            return {t.id: task_text(t) for s in self.stories for t in s.tasks}
        return {"": self.decisions}


def quote_found(ctx: ReviewContext, evidence: Evidence) -> bool:
    quote = normalize(evidence.quote)
    if len(quote) < MIN_QUOTE:
        return False
    texts = ctx.texts(evidence.where)
    pool = [texts[evidence.ref]] if evidence.ref in texts else list(texts.values())
    return any(quote in normalize(text) for text in pool)


def sole_cover(ctx: ReviewContext, task_id: str, excluded: frozenset[str] | set[str] = frozenset()) -> list[str]:
    """Что останется без задач, если убрать эту задачу (и уже убранные): требования, нужные операции, их тесты."""
    tasks = [t for s in ctx.stories for t in s.tasks]
    task = next(t for t in tasks if t.id == task_id)
    others = [t for t in tasks if t.id != task_id and t.id not in excluded]
    ops = {s.id for s in ctx.sources if s.kind in CONTRACT_OP_KINDS}
    needed_ops = {ref for r in ctx.requirements for ref in r.source_refs if ref in ops}
    lost = [r for r in task.requirement_ids if not any(r in t.requirement_ids for t in others)]
    lost += [op for op in task.source_refs if op in needed_ops and not any(op in t.source_refs for t in others)]
    if is_test_task(task):
        lost += [f"тест {op}" for op in task.source_refs if op in needed_ops
                 and not any(is_test_task(t) and op in t.source_refs for t in others)]
    return lost


def _reject(f: Finding, reason: str) -> None:
    f.verdict, f.verdict_reason = "rejected_by_filter", reason


def _filter_reason(f: Finding, ctx: ReviewContext, index: dict, story_ids: set[str]) -> str | None:
    if f.confidence < MIN_CONFIDENCE:
        return f"уверенность {f.confidence} < {MIN_CONFIDENCE}"
    unknown = [s for s in f.story_ids if s not in story_ids] + [t for t in f.task_ids if t not in index]
    if unknown:
        return f"несуществующие номера: {', '.join(unknown)}"
    if f.kind in NEEDS_TASK and not f.task_ids:
        return "не указана задача"
    if f.kind in NEEDS_TWO_TASKS and len(set(f.task_ids)) < 2:
        return "нужны две разные задачи"
    if not f.evidence:
        return "нет доказательства"
    missing = [e.quote for e in f.evidence if not quote_found(ctx, e)]
    if missing:
        return f"цитата не найдена во входных данных: «{missing[0][:80]}»"
    if f.kind == "unneeded_task" and (lost := sole_cover(ctx, f.task_ids[0])):
        return f"задача единственная для {', '.join(lost)}"
    return None


def filter_findings(findings: list[Finding], ctx: ReviewContext, limit: int | None = None) -> None:
    index = ctx.task_index()
    story_ids = {s.id for s in ctx.stories}
    for f in findings:
        if reason := _filter_reason(f, ctx, index, story_ids):
            _reject(f, reason)
    if limit is None:
        return
    alive = sorted((f for f in findings if f.verdict == "pending"),
                   key=lambda f: (SEVERITY_RANK[f.severity], -f.confidence))
    for f in alive[limit:]:
        _reject(f, f"лимит роли: {limit} находок за вызов")


def gap_findings(gaps: list[GapDraft], sources: list[Source], first_id: int) -> list[Finding]:
    """Пробелы аналитика как находки: ссылки существуют и хотя бы одна цитата есть в своём источнике."""
    texts = {s.id: normalize(f"{s.title}\n{s.text}") for s in sources}
    result = []
    for i, gap in enumerate(gaps):
        f = Finding(id=f"F-{first_id + i}", source="analyst", kind="gap", severity="high", confidence=100,
                    scenario=f"{gap.text} Риск: {gap.risk}",
                    evidence=[Evidence(where="source", ref=e.source_id, quote=e.quote) for e in gap.evidence])
        unknown = [r for r in gap.source_refs + [e.source_id for e in gap.evidence] if r not in texts]
        found = [e for e in gap.evidence
                 if len(normalize(e.quote)) >= MIN_QUOTE and normalize(e.quote) in texts.get(e.source_id, "")]
        if unknown:
            _reject(f, f"несуществующие источники: {', '.join(dict.fromkeys(unknown))}")
        elif not found:
            _reject(f, "ни одной цитаты из указанных источников")
        result.append(f)
    return result


def triage(findings: list[Finding]) -> list[Finding]:
    """Находки для скептика: упрощения, пробелы и CRITICAL/HIGH. MEDIUM/LOW становятся отложенными."""
    to_skeptic = []
    for f in findings:
        if f.verdict != "pending":
            continue
        if f.source in ("simplifier", "analyst") or SEVERITY_RANK[f.severity] <= SEVERITY_RANK["high"]:
            to_skeptic.append(f)
        else:
            f.verdict = "deferred"
    return to_skeptic


def _fallback(f: Finding, reason: str) -> None:
    if f.source == "simplifier":
        f.verdict, f.verdict_reason = "rejected", f"{reason}: без проверки работу не удаляем"
    else:
        f.verdict, f.verdict_reason = "confirmed", f"{reason}: принято без проверки"


def apply_verdicts(findings: list[Finding], verdicts: list[VerdictDraft] | None, reason: str = "") -> None:
    """Вердикты скептика. verdicts=None — скептик не работал (выключен или упал)."""
    by_id = {v.finding_id: v for v in verdicts or []}
    for f in findings:
        v = by_id.get(f.id)
        if v is None:
            _fallback(f, reason or ("скептик не вынес вердикт" if verdicts is not None else "скептик не проверял"))
        elif v.verdict == "confirmed":
            f.verdict, f.verdict_reason = "confirmed", v.reason
        elif v.verdict == "downgraded":
            lower = v.severity if v.severity and SEVERITY_RANK[v.severity] > SEVERITY_RANK["high"] else "medium"
            f.verdict, f.verdict_reason, f.severity = "downgraded", v.reason, lower
        else:
            f.verdict, f.verdict_reason = "rejected", v.reason


@dataclass
class Actions:
    removals: list[tuple[str, str, str]]
    redo: dict[str, list[Finding]]


def story_of(f: Finding, index: dict) -> str | None:
    if f.task_ids and f.task_ids[0] in index:
        return index[f.task_ids[0]][0].id
    return f.story_ids[0] if f.story_ids else None


def _removal_target(f: Finding, index: dict) -> str:
    if f.kind == "duplicate":
        return max(f.task_ids, key=lambda t: (index[t][0].id, t))
    return f.task_ids[0]


def plan_actions(findings: list[Finding], ctx: ReviewContext) -> Actions:
    """Подтверждённые удаления делает код; остальное и нерешённое — переделка истории с её отложенными."""
    index = ctx.task_index()
    actions = Actions([], {})
    removed: set[str] = set()
    for f in findings:
        active = f.verdict == "confirmed" and f.resolution not in ("fixed", "resolved")
        if not (active or f.resolution == "not_resolved"):
            continue
        story = story_of(f, index)
        if active and f.kind in REMOVAL_KINDS:
            target = _removal_target(f, index)
            if target in removed or not sole_cover(ctx, target, removed):
                if target not in removed:
                    removed.add(target)
                    actions.removals.append((index[target][0].id, target, f.id))
                f.resolution, f.resolution_note = "fixed", "задача удалена кодом"
                continue
            story = index[target][0].id
        if story is None:
            f.resolution_note = "не к чему применить"
            continue
        actions.redo.setdefault(story, []).append(f)
    for f in findings:
        if f.verdict in ("deferred", "downgraded") and (story := story_of(f, index)) in actions.redo:
            actions.redo[story].append(f)
    return actions


def apply_removals(stories: list[Story], removals: list[tuple[str, str, str]]) -> list[Story]:
    gone = {task_id for _, task_id, _ in removals}
    return [s.model_copy(update={"tasks": [t for t in s.tasks if t.id not in gone]}) for s in stories]


def _finding_line(f: Finding) -> str:
    quotes = "; ".join(f"«{e.quote}»" for e in f.evidence)
    tasks = f" · {', '.join(f.task_ids)}" if f.task_ids else ""
    line = f"- [{f.id}] {f.severity.upper()} · {f.kind}{tasks}: {f.scenario}"
    if f.fix:
        line += f" Исправить: {f.fix}"
    if quotes:
        line += f" Доказательство: {quotes}"
    if f.resolution_note:
        line += f" (прошлый ответ: {f.resolution or ''} {f.resolution_note})"
    return line


def redo_text(findings: list[Finding]) -> str:
    main = [f for f in findings if f.verdict not in ("deferred", "downgraded")]
    optional = [f for f in findings if f.verdict in ("deferred", "downgraded")]
    parts = []
    if main:
        parts.append("Находки проверки — по каждой [F-…] верни в responses статус fixed или disputed с причиной:\n"
                     + "\n".join(_finding_line(f) for f in main))
    if optional:
        parts.append("Необязательно (мелкие замечания; исправь, если согласен):\n"
                     + "\n".join(_finding_line(f) for f in optional))
    return "\n\n".join(parts)


def issues_by_story(stories: list[Story], requirements: list[Requirement], issues: list[Issue],
                    skip: tuple[str, ...]) -> dict[str, list[str]]:
    """Замечания проверок кода, которые можно исправить перегенерацией задач конкретной истории."""
    task_story = {t.id: s.id for s in stories for t in s.tasks}
    req_stories: dict[str, list[str]] = {}
    for s in stories:
        for r in s.requirement_ids:
            req_stories.setdefault(r, []).append(s.id)
    op_stories: dict[str, set[str]] = {}
    for r in requirements:
        for ref in r.source_refs:
            op_stories.setdefault(ref, set()).update(req_stories.get(r.id, []))
    result: dict[str, list[str]] = {}
    for issue in issues:
        if issue.code in skip:
            continue
        targets = ({task_story[issue.target_id]} if issue.target_id in task_story
                   else set(req_stories.get(issue.target_id, [])) | op_stories.get(issue.target_id, set())
                   | ({issue.target_id} if issue.target_id.startswith("US-") else set()))
        for sid in targets:
            result.setdefault(sid, []).append(f"{issue.target_id}: {issue.message}")
    return result
