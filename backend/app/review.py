"""Проверка результата.

Режим `review`: рецензенты историй, редактор стыков, упрощатель → фильтр находок кодом →
скептик → удаление задач кодом или переделка истории. Режим `critic` — прежний один критик.
"""

import asyncio
import json
from dataclasses import dataclass

from langchain_core.runnables import RunnableConfig

from app.calls import (
    DECISIONS_HEADING,
    ask,
    decisions_block,
    emit,
    language_line,
    requirements_block,
    requirements_of,
    sources_of,
    stories_of,
)
from app.checks import run_checks
from app.config import get_settings
from app.context import render_sources, story_context
from app.findings import (
    LIMITS,
    ReviewContext,
    apply_removals,
    apply_verdicts,
    filter_findings,
    gap_findings,
    issues_by_story,
    plan_actions,
    redo_text,
    story_of,
    triage,
)
from app.llm import LLMError
from app.schemas import (
    CriticOut,
    EditorOut,
    Finding,
    GapDraft,
    Issue,
    ReviewerOut,
    ReviewSkip,
    SimplifierOut,
    SkepticOut,
    Story,
)

NOT_FIXABLE_BY_TASKS = ("story_format", "story_without_criteria", "requirement_without_story")
ADVISORY_ISSUES = ("duplicate_task",)  # кандидаты для проверяющих: сами на доработку не отправляют
KNOWN_HEADING = "Известное и принятое — не сообщать"
MODE_FULL, MODE_DELTA, MODE_RESOLUTION = "полная проверка", "изменения и решённость", "только решённость"
REMOVED_NOTE = "задача удалена кодом"
FINDING_FIELDS = {"id", "source", "kind", "severity", "confidence", "story_ids", "task_ids", "scenario",
                  "evidence", "fix"}


@dataclass
class ReviewOptions:
    mode: str
    skeptic: bool
    simplifier: bool
    rounds: int


def review_options(config: RunnableConfig) -> ReviewOptions:
    c = config.get("configurable") or {}
    s = get_settings()
    return ReviewOptions(mode=c.get("review_mode", s.review_mode), skeptic=c.get("review_skeptic", s.review_skeptic),
                         simplifier=c.get("review_simplifier", s.review_simplifier), rounds=s.critic_rounds)


def context_from_state(state: dict) -> ReviewContext:
    return ReviewContext(stories_of(state), requirements_of(state), sources_of(state), decisions_block(state))


def _findings(state: dict) -> list[Finding]:
    return [Finding.model_validate(f) for f in state.get("findings", [])]


def _dump(items) -> list[dict]:
    return [i.model_dump() for i in items]


def _skip(step: str, reason: str, story_id: str | None = None) -> ReviewSkip:
    emit("review_skipped", step=step, story_id=story_id, reason=reason)
    return ReviewSkip(step=step, story_id=story_id, reason=reason)


def _issues(state: dict) -> list[Issue]:
    return [Issue.model_validate(i) for i in state.get("issues", [])]


# ---------- входы ролей ----------

def _criteria(story: Story) -> str:
    return "\n".join(f"- {c}" for c in story.acceptance_criteria) or "—"


def _previous_line(f: Finding) -> str:
    line = f"- [{f.id}] {f.kind} · {', '.join(f.task_ids) or '—'}: {f.scenario}"
    if f.fix:
        line += f" Исправить: {f.fix}"
    if f.resolution in ("fixed", "disputed"):
        line += f" Ответ генератора: {f.resolution} — {f.resolution_note or 'без пояснения'}"
    return line


def reviewer_user(state: dict, ctx: ReviewContext, story: Story, mode: str, previous: list[Finding],
                  issue_lines: list[str]) -> str:
    reqs = {r.id: r for r in ctx.requirements}
    story_reqs = [reqs[r] for r in story.requirement_ids if r in reqs]
    refs = {ref for r in story_reqs for ref in r.source_refs}
    query = " ".join([story.title, story.description, *story.acceptance_criteria, *(r.text for r in story_reqs)])
    sources = story_context(ctx.sources, refs, query, get_settings().context_char_budget)
    others = "\n".join(f"- {s.id}: {t.id} {t.title}" for s in ctx.stories if s.id != story.id for t in s.tasks)
    tasks = json.dumps([t.model_dump() for t in story.tasks], ensure_ascii=False, indent=1)
    text = (f"# Эпик: {state['title']}\n{language_line(state)}\n\n## Режим: {mode}\n\n"
            f"## История {story.id}\n{story.title}\n{story.description}\nКритерии приёмки:\n{_criteria(story)}\n\n"
            f"## Требования истории\n{requirements_block(story_reqs)}\n\n"
            f"## {KNOWN_HEADING}\n{ctx.decisions}\n\n"
            f"## Задачи истории\n```json\n{tasks}\n```\n\n"
            f"## Замечания проверок кода к истории\n{chr(10).join('- ' + line for line in issue_lines) or '—'}\n\n"
            f"## Задачи других историй\n{others or '—'}\n\n")
    if previous:
        text += "## Находки прошлого круга\n" + "\n".join(_previous_line(f) for f in previous) + "\n\n"
    return text + f"## Источники\n{render_sources(sources)}"


def _stories_overview(ctx: ReviewContext, describe: bool) -> str:
    blocks = []
    for s in ctx.stories:
        tasks = []
        for t in s.tasks:
            line = f"- {t.id} [{t.type}] {t.title} (требования: {', '.join(t.requirement_ids) or '—'})"
            if describe:
                line += f"\n  {t.description[:220]}"
            tasks.append(line)
        blocks.append(f"### {s.id}: {s.title}\nКритерии приёмки:\n{_criteria(s)}\nЗадачи:\n"
                      + ("\n".join(tasks) or "—"))
    return "\n\n".join(blocks)


def editor_user(state: dict, ctx: ReviewContext, candidates: list[str]) -> str:
    return (f"# Эпик: {state['title']}\n{language_line(state)}\n\n"
            f"## Требования\n{requirements_block(ctx.requirements)}\n\n"
            f"## {KNOWN_HEADING}\n{ctx.decisions}\n\n"
            f"## Истории и задачи\n{_stories_overview(ctx, describe=False)}\n\n"
            f"## Подсказки кода: возможные дубли\n{chr(10).join('- ' + c for c in candidates) or '—'}")


def simplifier_user(state: dict, ctx: ReviewContext) -> str:
    return (f"# Эпик: {state['title']}\n{language_line(state)}\n\n"
            f"## Требования\n{requirements_block(ctx.requirements)}\n\n"
            f"## {KNOWN_HEADING}\n{ctx.decisions}\n\n"
            f"## Истории и задачи\n{_stories_overview(ctx, describe=True)}")


def skeptic_user(ctx: ReviewContext, findings: list[Finding], gaps: bool = False) -> str:
    index = ctx.task_index()
    task_ids = list(dict.fromkeys(t for f in findings for t in f.task_ids if t in index))
    tasks = [index[t][1].model_dump() | {"story_id": index[t][0].id} for t in task_ids]
    req_ids = {e.ref for f in findings for e in f.evidence if e.where == "requirement"}
    req_ids |= {r for t in task_ids for r in index[t][1].requirement_ids}
    story_ids = {s for f in findings for s in f.story_ids} | {index[t][0].id for t in task_ids}
    story_ids |= {e.ref for f in findings for e in f.evidence if e.where == "criterion"}
    source_ids = {e.ref for f in findings for e in f.evidence if e.where == "source"}
    sources = render_sources([s for s in ctx.sources if s.id in source_ids])[:get_settings().context_char_budget]
    stories = [f"- {s.id}: {s.title}\n  Критерии приёмки:\n" + _criteria(s) for s in ctx.stories if s.id in story_ids]
    findings_json = json.dumps([f.model_dump(include=FINDING_FIELDS) for f in findings], ensure_ascii=False, indent=1)
    heading = "## Пробелы аналитика" if gaps else "## Находки на проверку"
    return (f"{heading}\n```json\n{findings_json}\n```\n\n"
            f"## {DECISIONS_HEADING}\n{ctx.decisions}\n\n"
            f"## Требования\n{requirements_block([r for r in ctx.requirements if r.id in req_ids]) or '—'}\n\n"
            f"## Истории\n{chr(10).join(stories) or '—'}\n\n"
            f"## Задачи\n```json\n{json.dumps(tasks, ensure_ascii=False, indent=1)}\n```\n\n"
            f"## Источники\n{sources or '—'}")


# ---------- круг проверки ----------

def _previous_for(findings: list[Finding], ctx: ReviewContext, story_id: str) -> list[Finding]:
    """Подтверждённые находки, по которым история переделывалась и решённость ещё не проверена."""
    index = ctx.task_index()
    return [f for f in findings if f.verdict == "confirmed" and f.resolution != "resolved"
            and f.resolution_note != REMOVED_NOTE and story_of(f, index) == story_id]


async def _guarded(semaphore: asyncio.Semaphore, role: str, story: Story | None, call):
    try:
        async with semaphore:
            return role, story, await call(), None
    except LLMError as e:
        return role, story, None, str(e)


async def _judge(config: RunnableConfig, opts: ReviewOptions, items: list[Finding], user: str, node: str,
                 skipped: list[ReviewSkip]) -> str | None:
    verdicts, error = None, None
    if opts.skeptic:
        try:
            verdicts = (await ask(config, node, "skeptic", user, SkepticOut)).verdicts
        except LLMError as e:
            error = str(e)
            skipped.append(_skip(node, error))
    apply_verdicts(items, verdicts, "скептик упал" if error else ("" if opts.skeptic else "скептик выключен"))
    return error


def _apply_resolutions(findings: list[Finding], resolutions, touched: set[str]) -> None:
    by_id = {f.id: f for f in findings}
    for r in resolutions:
        if (f := by_id.get(r.finding_id)) is not None:
            f.resolution, f.resolution_note = r.status, r.note
            touched.add(f.id)


async def review_round(state: dict, config: RunnableConfig, round_: int) -> dict:
    opts = review_options(config)
    label = f"Проверка, круг {round_}"
    emit("node_started", node="critic", label=label)
    ctx = context_from_state(state)
    findings = _findings(state)
    issues = _issues(state)
    hints = issues_by_story(ctx.stories, ctx.requirements, issues, NOT_FIXABLE_BY_TASKS)
    redone = set(state.get("redone", []))
    targets = ctx.stories if round_ == 1 else [s for s in ctx.stories if s.id in redone]
    mode = MODE_FULL if round_ == 1 else MODE_DELTA
    semaphore = asyncio.Semaphore(get_settings().llm_concurrency)
    skipped: list[ReviewSkip] = []

    jobs = []
    for story in targets:
        user = reviewer_user(state, ctx, story, mode, _previous_for(findings, ctx, story.id) if round_ > 1 else [],
                             hints.get(story.id, []))
        jobs.append(_guarded(semaphore, "reviewer", story,
                             lambda u=user, s=story: ask(config, f"review:{s.id}", "reviewer", u, ReviewerOut)))
    if round_ == 1:
        candidates = [f"{i.target_id}: {i.message}" for i in issues if i.code == "duplicate_task"]
        jobs.append(_guarded(semaphore, "editor", None,
                             lambda: ask(config, "junction", "junction", editor_user(state, ctx, candidates), EditorOut)))
        if opts.simplifier:
            jobs.append(_guarded(semaphore, "simplifier", None,
                                 lambda: ask(config, "simplifier", "simplifier", simplifier_user(state, ctx),
                                             SimplifierOut)))
    results = await asyncio.gather(*jobs)

    new: list[Finding] = []
    touched: set[str] = set()
    number = len(findings) + 1
    for role, story, out, error in results:
        if out is None:
            skipped.append(_skip(role, error, story.id if story else None))
            continue
        if role == "reviewer":
            _apply_resolutions(findings, out.resolutions, touched)
        batch = []
        for draft in out.findings:
            f = Finding(id=f"F-{number}", source=role, round=round_, **draft.model_dump())
            if role == "reviewer" and not f.story_ids:
                f.story_ids = [story.id]
            number += 1
            batch.append(f)
        filter_findings(batch, ctx, limit=LIMITS[role])
        new += batch
    emit("findings_collected", round=round_, findings=_dump(new))
    if touched:
        emit("findings_resolution", round=round_,
             items=[{"id": f.id, "resolution": f.resolution, "note": f.resolution_note}
                    for f in findings if f.id in touched])

    error = None
    to_skeptic = triage(new)
    if to_skeptic:
        error = await _judge(config, opts, to_skeptic, skeptic_user(ctx, to_skeptic), "skeptic", skipped)
        emit("findings_judged", round=round_, error=error,
             verdicts=[{"id": f.id, "verdict": f.verdict, "severity": f.severity, "reason": f.verdict_reason}
                       for f in to_skeptic])

    reopened = [f for f in findings if f.id in touched and f.resolution == "not_resolved"]
    actions = plan_actions(new + reopened, ctx)
    stories, coverage = ctx.stories, state.get("coverage") or {}
    if actions.removals:
        stories = apply_removals(stories, actions.removals)
        for story_id, task_id, finding_id in actions.removals:
            emit("tasks_removed", story_id=story_id, task_ids=[task_id], finding_id=finding_id)
        issues, cov = run_checks(ctx.sources, ctx.requirements, stories)
        coverage = cov.model_dump()
        emit("checks_finished", issues=_dump(issues), coverage=coverage)

    code_lines = issues_by_story(stories, ctx.requirements, issues, NOT_FIXABLE_BY_TASKS + ADVISORY_ISSUES)
    redo: dict[str, str] = {}
    for s in stories:
        parts = []
        if s.id in actions.redo:
            parts.append(redo_text(actions.redo[s.id]))
        if s.id in code_lines:
            parts.append("Замечания проверок кода:\n" + "\n".join(f"- {line}" for line in code_lines[s.id]))
        if parts:
            redo[s.id] = "\n\n".join(parts)
    emit("critic_feedback", round=round_, notes=[{"story_id": k, "problem": v} for k, v in redo.items()], error=error)

    confirmed = sum(f.verdict == "confirmed" for f in new)
    summary = (f"Находок: {len(new)}, подтверждено: {confirmed}, удалено задач: {len(actions.removals)}, "
               f"на доработку историй: {len(redo)}")
    if skipped:
        summary += f", не проверено: {len(skipped)}"
    emit("node_finished", node="critic", label=label, summary=summary)
    return {"findings": _dump(findings + new), "redo": redo, "redone": list(redo), "critic_round": round_,
            "stories": _dump(stories), "issues": _dump(issues), "coverage": coverage,
            "review_skipped": state.get("review_skipped", []) + _dump(skipped)}


async def resolution_check(state: dict, config: RunnableConfig) -> dict:
    """После последней переделки: решены ли подтверждённые находки. Без новых находок и скептика."""
    ctx = context_from_state(state)
    findings = _findings(state)
    targets = [(s, prev) for s in ctx.stories if s.id in set(state.get("redone", []))
               if (prev := _previous_for(findings, ctx, s.id))]
    if not targets:
        return {"redo": {}, "redone": []}
    label = "Проверка решённости"
    emit("node_started", node="critic", label=label)
    hints = issues_by_story(ctx.stories, ctx.requirements, _issues(state), NOT_FIXABLE_BY_TASKS)
    semaphore = asyncio.Semaphore(get_settings().llm_concurrency)
    jobs = [_guarded(semaphore, "reviewer", s,
                     lambda u=reviewer_user(state, ctx, s, MODE_RESOLUTION, prev, hints.get(s.id, [])), st=s:
                     ask(config, f"review:{st.id}", "reviewer", u, ReviewerOut))
            for s, prev in targets]
    skipped: list[ReviewSkip] = []
    touched: set[str] = set()
    for _, story, out, error in await asyncio.gather(*jobs):
        if out is None:
            skipped.append(_skip("resolution", error, story.id))
        else:
            _apply_resolutions(findings, out.resolutions, touched)
    emit("findings_resolution", round=state.get("critic_round", 0) + 1,
         items=[{"id": f.id, "resolution": f.resolution, "note": f.resolution_note}
                for f in findings if f.id in touched])
    open_ = sum(f.resolution == "not_resolved" for f in findings if f.id in touched)
    summary = f"Проверено находок: {len(touched)}, не решено: {open_}"
    if skipped:
        summary += f", не проверено историй: {len(skipped)}"
    emit("node_finished", node="critic", label=label, summary=summary)
    return {"findings": _dump(findings), "redo": {}, "redone": [],
            "review_skipped": state.get("review_skipped", []) + _dump(skipped)}


async def judge_gaps(state: dict, config: RunnableConfig, gaps: list[GapDraft]
                     ) -> tuple[list[GapDraft], list[Finding], list[ReviewSkip]]:
    """Пробелы аналитика: фильтр цитат и скептик. На истории влияют только подтверждённые."""
    opts = review_options(config)
    ctx = ReviewContext([], requirements_of(state), sources_of(state), decisions_block(state))
    findings = gap_findings(gaps, ctx.sources, first_id=len(state.get("findings", [])) + 1)
    pending = [f for f in findings if f.verdict == "pending"]
    skipped: list[ReviewSkip] = []
    emit("findings_collected", round=0, findings=_dump(findings))
    if pending:
        error = await _judge(config, opts, pending, skeptic_user(ctx, pending, gaps=True), "skeptic:gaps", skipped)
        emit("findings_judged", round=0, error=error,
             verdicts=[{"id": f.id, "verdict": f.verdict, "severity": f.severity, "reason": f.verdict_reason}
                       for f in pending])
    kept = [g for g, f in zip(gaps, findings) if f.verdict == "confirmed"]
    return kept, findings, skipped


async def legacy_critic(state: dict, config: RunnableConfig) -> dict:
    """Режим `critic`: один критик на весь эпик (поведение до проверяющих ролей)."""
    round_ = state.get("critic_round", 0)
    if round_ >= get_settings().critic_rounds:
        return {"redo": {}}
    emit("node_started", node="critic", label=f"Критик, круг {round_ + 1}")
    stories, reqs, issues = stories_of(state), requirements_of(state), _issues(state)
    by_story = issues_by_story(stories, reqs, issues, NOT_FIXABLE_BY_TASKS)
    payload = [{
        "id": s.id, "title": s.title, "acceptance_criteria": s.acceptance_criteria,
        "requirement_ids": s.requirement_ids,
        "tasks": [{"id": t.id, "type": t.type, "title": t.title, "source_refs": t.source_refs,
                   "test_scenarios": len(t.test_scenarios)} for t in s.tasks],
        "check_issues": by_story.get(s.id, []),
    } for s in stories]
    user = (f"# Эпик: {state['title']}\n{language_line(state)}\n\n"
            f"## Требования\n{requirements_block(reqs)}\n\n"
            f"## {DECISIONS_HEADING}\n{decisions_block(state)}\n\n"
            f"## Истории и задачи\n```json\n{json.dumps(payload, ensure_ascii=False, indent=1)}\n```")
    skipped: list[ReviewSkip] = []
    try:
        out: CriticOut = await ask(config, "critic", "critic", user, CriticOut)
        critic_error = None
    except LLMError as e:
        out, critic_error = CriticOut(), str(e)
        skipped.append(_skip("critic", critic_error))
    story_ids = {s.id for s in stories}
    redo: dict[str, str] = {}
    for note in out.notes:
        if note.story_id in story_ids:
            redo[note.story_id] = (redo.get(note.story_id, "") + "\n" + note.problem).strip()
    for sid, lines in issues_by_story(stories, reqs, issues, NOT_FIXABLE_BY_TASKS + ADVISORY_ISSUES).items():
        if sid in story_ids:
            redo[sid] = (redo.get(sid, "") + "\nЗамечания проверок:\n" + "\n".join(f"- {l}" for l in lines)).strip()
    notes = [{"story_id": sid, "problem": text} for sid, text in redo.items()]
    emit("critic_feedback", round=round_ + 1, notes=notes, error=critic_error)
    summary = "Замечаний нет" if not redo else f"На доработку историй: {len(redo)}"
    if critic_error:
        summary = f"Критик не ответил, работаем по проверкам кода. {summary}"
    emit("node_finished", node="critic", label=f"Критик, круг {round_ + 1}", summary=summary)
    return {"redo": redo, "critic_round": round_ + 1,
            "review_skipped": state.get("review_skipped", []) + _dump(skipped)}
