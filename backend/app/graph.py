"""Граф агента-декомпозитора. LLM отвечает за смысл, всё детерминированное делает код.

Узлы шлют события через get_stream_writer() (stream mode «custom») — их получает раннер
и LangGraph Studio (`langgraph dev`).
"""

import asyncio
import base64
import json
import re
from typing import TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from app.calls import DECISIONS_HEADING, ask, emit, get_limiter, get_llm
from app.calls import decisions_block as _decisions_block
from app.calls import language_line as _language_line
from app.calls import requirements_block as _requirements_block
from app.calls import requirements_of as _requirements
from app.calls import sources_of as _sources
from app.calls import stories_of as _stories
from app.checks import compute_stats, run_checks
from app.config import get_settings
from app.context import render_sources, select_context, story_context
from app.language import CONFIDENT, detect_language
from app.llm import LLMError
from app.prompts import prompt_snapshot
from app.review import judge_gaps, legacy_critic, resolution_check, review_options, review_round
from app.schemas import (
    AnalystOut,
    Decomposition,
    Epic,
    Finding,
    Gap,
    Issue,
    Language,
    Question,
    Requirement,
    RequirementsOut,
    Source,
    SourceRef,
    StoriesOut,
    Story,
    Task,
    TaskResponse,
    TasksOut,
    epic_label,
)
from app.sources import InputFile, parse_inputs

MAX_QUESTIONS = 5
LANGUAGE_QUESTION_ID = "Q-LANG"
LANGUAGE_CHOICES = ["C++", "C#", "Go", "Python", "Java"]


class State(TypedDict, total=False):
    title: str
    epic_text: str
    files: list[dict]
    skip_questions: bool
    sources: list[dict]
    language: dict
    requirements: list[dict]
    questions: list[dict]
    gaps: list[dict]
    assumptions: list[str]
    stories: list[dict]
    issues: list[dict]
    coverage: dict
    critic_round: int
    redo: dict[str, str]
    redone: list[str]
    findings: list[dict]
    review_skipped: list[dict]
    result: dict


def encode_files(files: list[InputFile]) -> list[dict]:
    return [{"name": f.name, "role": f.role, "data": base64.b64encode(f.content).decode()} for f in files]


def decode_files(files: list[dict]) -> list[InputFile]:
    return [InputFile(name=f["name"], role=f["role"], content=base64.b64decode(f["data"])) for f in files]


# ---------- узлы ----------

async def parse_inputs_node(state: State) -> State:
    emit("node_started", node="parse_inputs", label="Разбор входов")
    sources = parse_inputs(state["epic_text"], decode_files(state.get("files", [])))
    emit("sources_parsed",
         sources=[{"id": s.id, "kind": s.kind, "file": s.file, "title": s.title, "excerpt": s.text[:600]}
                  for s in sources],
         contract_ops=[s.id for s in sources if s.kind in ("proto_rpc", "openapi_op")])
    emit("node_finished", node="parse_inputs", label="Разбор входов", summary=f"Фрагментов: {len(sources)}")
    return {"sources": [s.model_dump() for s in sources], "critic_round": 0, "redo": {}, "assumptions": []}


async def detect_language_node(state: State) -> State:
    emit("node_started", node="detect_language", label="Целевой язык")
    lang = detect_language(decode_files(state.get("files", [])), _sources(state))
    emit("language_detected", **lang.model_dump())
    emit("node_finished", node="detect_language", label="Целевой язык",
         summary=f"{lang.value or 'не определён'} ({lang.confidence})")
    return {"language": lang.model_dump()}


async def requirements_node(state: State, config: RunnableConfig) -> State:
    emit("node_started", node="requirements", label="Требования")
    settings = get_settings()
    context = select_context(_sources(state), state["epic_text"], settings.context_char_budget)
    user = (f"# Эпик: {state['title']}\n{_language_line(state)}\n\n"
            f"## Источники\n{render_sources(context)}")
    out: RequirementsOut = await ask(config, "requirements", "requirements", user, RequirementsOut)
    reqs = [r.model_copy(update={"id": f"REQ-{i:03d}"}) for i, r in enumerate(out.requirements, 1)]
    for r in reqs:
        emit("requirement_created", requirement=r.model_dump())
    emit("node_finished", node="requirements", label="Требования", summary=f"Требований: {len(reqs)}")
    return {"requirements": [r.model_dump() for r in reqs]}


def _language_question(lang: Language) -> Question:
    options = list(dict.fromkeys(([lang.value] if lang.value else []) + LANGUAGE_CHOICES))[:3]
    return Question(id=LANGUAGE_QUESTION_ID, text="На каком языке программирования реализуется интеграция?",
                    options=options, recommended=0)


async def analyst_node(state: State, config: RunnableConfig) -> State:
    emit("node_started", node="analyst", label="Аналитик: вопросы и пробелы")
    settings = get_settings()
    context = select_context(_sources(state), state["epic_text"], settings.context_char_budget)
    user = (f"# Эпик: {state['title']}\n{_language_line(state)}\n\n"
            f"## Требования\n{_requirements_block(_requirements(state))}\n\n"
            f"## Источники\n{render_sources(context)}")
    out: AnalystOut = await ask(config, "analyst", "analyst", user, AnalystOut)
    questions = [
        Question(id=f"Q-{i}", text=q.text, options=q.options,
                 recommended=q.recommended if 0 <= q.recommended < len(q.options) else 0)
        for i, q in enumerate([q for q in out.questions if q.options][:MAX_QUESTIONS], 1)
    ]
    lang = Language.model_validate(state["language"])
    if lang.confidence < CONFIDENT:
        questions.insert(0, _language_question(lang))
    drafts, findings, skipped = out.gaps, [], []
    if review_options(config).mode == "review" and drafts:
        drafts, findings, skipped = await judge_gaps(state, config, drafts)
    gaps = [Gap(id=f"GAP-{i}", **g.model_dump()) for i, g in enumerate(drafts, 1)]
    for g in gaps:
        emit("gap_found", gap=g.model_dump())
    if questions:
        emit("questions_asked", questions=[q.model_dump() for q in questions],
             waiting=not state.get("skip_questions", False))
    emit("node_finished", node="analyst", label="Аналитик: вопросы и пробелы",
         summary=f"Вопросов: {len(questions)}, пробелов: {len(gaps)}"
                 + (f" (отклонено: {len(out.gaps) - len(gaps)})" if len(out.gaps) > len(gaps) else ""))
    return {"questions": [q.model_dump() for q in questions], "gaps": [g.model_dump() for g in gaps],
            "findings": state.get("findings", []) + [f.model_dump() for f in findings],
            "review_skipped": state.get("review_skipped", []) + [s.model_dump() for s in skipped]}


async def ask_user_node(state: State) -> State:
    questions = [Question.model_validate(q) for q in state.get("questions", [])]
    answers: dict[str, str] = {}
    if questions and not state.get("skip_questions", False):
        answers = interrupt({"questions": [q.model_dump() for q in questions]}) or {}
    assumptions = list(state.get("assumptions", []))
    language = Language.model_validate(state["language"])
    for q in questions:
        answer = (answers.get(q.id) or "").strip()
        default = q.options[q.recommended] if q.options else ""
        q.answer = answer or None
        if q.id == LANGUAGE_QUESTION_ID:
            if answer:
                language = Language(value=answer, confidence=1.0, evidence=["ответ пользователя"])
            elif language.value:
                assumptions.append(f"Целевой язык — {language.value} (определён по косвенным признакам).")
            else:
                language = Language(value=default, confidence=0.3, evidence=["допущение"])
                assumptions.append(f"Целевой язык не указан, принят {default}.")
        elif not answer:
            assumptions.append(f"{q.text} — принято без ответа: {default}")
    emit("answers_received", answers=answers, assumptions=assumptions, language=language.model_dump())
    return {"questions": [q.model_dump() for q in questions], "assumptions": assumptions,
            "language": language.model_dump()}


async def stories_node(state: State, config: RunnableConfig) -> State:
    emit("node_started", node="stories", label="Пользовательские истории")
    reqs = _requirements(state)
    user = (f"# Эпик: {state['title']}\n{state['epic_text']}\n\n{_language_line(state)}\n\n"
            f"## Требования\n{_requirements_block(reqs)}\n\n"
            f"## {DECISIONS_HEADING}\n{_decisions_block(state)}")
    out: StoriesOut = await ask(config, "stories", "stories", user, StoriesOut)
    req_ids = {r.id for r in reqs}
    stories = []
    for i, s in enumerate(out.stories, 1):
        story = Story(id=f"US-{i:03d}", **s.model_dump())
        story.requirement_ids = [r for r in story.requirement_ids if r in req_ids] or story.requirement_ids
        stories.append(story)
        emit("story_created", story=story.model_dump(exclude={"tasks"}))
    emit("node_finished", node="stories", label="Пользовательские истории", summary=f"Историй: {len(stories)}")
    return {"stories": [s.model_dump() for s in stories]}


def _next_task_number(stories: list[Story]) -> int:
    numbers = [int(m.group(1)) for s in stories for t in s.tasks if (m := re.match(r"TASK-(\d+)$", t.id))]
    return max(numbers, default=0) + 1


async def tasks_node(state: State, config: RunnableConfig) -> State:
    redo = state.get("redo") or {}
    stories = _stories(state)
    targets = [s for s in stories if s.id in redo] if redo else [s for s in stories if not s.tasks]
    emit("node_started", node="tasks", label="Технические задачи" if not redo else "Исправление задач",
         stories=[s.id for s in targets])
    settings = get_settings()
    sources = _sources(state)
    reqs = {r.id: r for r in _requirements(state)}
    semaphore = get_limiter(config)
    fresh: dict[str, list] = {}
    responses: list[TaskResponse] = []
    story_list = "\n".join(f"- {s.id}: {s.title} (требования: {', '.join(s.requirement_ids) or '—'})"
                           for s in stories)

    def other_tasks(story: Story) -> str:
        lines = [f"- {s.id}: {t.title}" for s in stories if s.id != story.id
                 for t in fresh.get(s.id, s.tasks)]
        return "\n".join(lines) or "—"

    async def generate(story: Story) -> list | None:
        story_reqs = [reqs[r] for r in story.requirement_ids if r in reqs]
        refs = {ref for r in story_reqs for ref in r.source_refs}
        query = " ".join([story.title, story.description, *story.acceptance_criteria, *(r.text for r in story_reqs)])
        context = story_context(sources, refs, query, settings.context_char_budget)
        async with semaphore:
            user = (f"# Эпик: {state['title']}\n{_language_line(state)}\n\n"
                    f"## История {story.id}\n{story.title}\n{story.description}\n"
                    "Критерии приёмки:\n" + "\n".join(f"- {c}" for c in story.acceptance_criteria) +
                    f"\n\n## Требования истории\n{_requirements_block(story_reqs)}\n\n"
                    f"## {DECISIONS_HEADING}\n{_decisions_block(state)}\n\n"
                    f"## Другие истории эпика\n{story_list}\n\n"
                    f"## Уже созданные задачи других историй\n{other_tasks(story)}\n\n"
                    f"## Источники\n{render_sources(context)}")
            if story.id in redo:
                current = [t.model_dump(exclude={"id"}) for t in story.tasks]
                user += (f"\n\n## Текущие задачи истории\n```json\n{json.dumps(current, ensure_ascii=False)}\n```"
                         f"\n\n## Замечания, которые нужно исправить\n{redo[story.id]}")
            try:
                out: TasksOut = await ask(config, f"tasks:{story.id}", "tasks", user, TasksOut)
            except LLMError as e:  # история остаётся как была; без задач её вернут на доработку проверки
                emit("tasks_failed", story_id=story.id, error=str(e))
                return None
        fresh[story.id] = out.tasks
        responses.extend(out.responses)
        return out.tasks

    results = await asyncio.gather(*(generate(s) for s in targets))
    number = _next_task_number(stories)
    by_id = {s.id: s for s in stories}
    total = 0
    for story, drafts in zip(targets, results):
        if drafts is None:
            continue
        target = by_id[story.id]
        if target.tasks:
            emit("tasks_replaced", story_id=story.id, removed=[t.id for t in target.tasks])
        target.tasks = []
        for draft in drafts:
            task = Task(id=f"TASK-{number:03d}", **draft.model_dump())
            number += 1
            target.tasks.append(task)
            emit("task_created", story_id=story.id, task=task.model_dump())
        total += len(drafts)
    failed = sum(drafts is None for drafts in results)
    emit("node_finished", node="tasks", label="Технические задачи",
         summary=f"Задач: {total}" + (f", сбоев модели: {failed}" if failed else ""))
    findings = [Finding.model_validate(f) for f in state.get("findings", [])]
    by_id = {f.id: f for f in findings}
    for r in responses:
        if (f := by_id.get(r.finding_id)) is not None:
            f.resolution, f.resolution_note = r.status, r.note
    return {"stories": [s.model_dump() for s in stories], "redo": {}, "findings": [f.model_dump() for f in findings]}


async def checks_node(state: State) -> State:
    emit("node_started", node="checks", label="Проверки кодом (ОТК)")
    issues, coverage = run_checks(_sources(state), _requirements(state), _stories(state))
    emit("checks_finished", issues=[i.model_dump() for i in issues], coverage=coverage.model_dump())
    errors = sum(i.severity == "error" for i in issues)
    emit("node_finished", node="checks", label="Проверки кодом (ОТК)",
         summary=f"Замечаний: {len(issues)} (ошибок: {errors}), покрытие {coverage.coverage_percent}%")
    return {"issues": [i.model_dump() for i in issues], "coverage": coverage.model_dump()}


async def critic_node(state: State, config: RunnableConfig) -> State:
    opts = review_options(config)
    if opts.mode == "critic":
        return await legacy_critic(state, config)
    round_ = state.get("critic_round", 0)
    if round_ >= opts.rounds:
        return await resolution_check(state, config)
    return await review_round(state, config, round_ + 1)


def after_critic(state: State) -> str:
    return "tasks" if state.get("redo") else "finalize"


async def finalize_node(state: State, config: RunnableConfig) -> State:
    emit("node_started", node="finalize", label="Сборка результата")
    sources = _sources(state)
    reqs = _requirements(state)
    stories = _stories(state)
    questions = [Question.model_validate(q) for q in state.get("questions", [])]
    gaps = [Gap.model_validate(g) for g in state.get("gaps", [])]
    issues = [Issue.model_validate(i) for i in state.get("issues", [])]
    assumptions = state.get("assumptions", [])
    result = Decomposition(
        epic=Epic(title=state["title"], text=state["epic_text"], label=epic_label(state["title"])),
        target_language=Language.model_validate(state.get("language") or {}),
        sources=[SourceRef(id=s.id, kind=s.kind, file=s.file, title=s.title, excerpt=s.text[:600]) for s in sources],
        requirements=reqs,
        stories=stories,
        questions=questions,
        assumptions=assumptions,
        gaps=gaps,
        issues=issues,
        findings=state.get("findings", []),
        review_skipped=state.get("review_skipped", []),
        coverage=state.get("coverage") or {},
        stats=compute_stats(reqs, stories, questions, gaps, assumptions, issues),
        model=get_llm(config).model,
        prompt_versions={name: p.version for name, p in prompt_snapshot().items()},
    )
    emit("run_finished", stats=result.stats.model_dump(), coverage=result.coverage.model_dump())
    emit("node_finished", node="finalize", label="Сборка результата",
         summary=f"Историй: {result.stats.stories_count}, задач: {result.stats.tasks_count}")
    return {"result": result.model_dump()}


def build_graph(checkpointer=None):
    g = StateGraph(State)
    g.add_node("parse_inputs", parse_inputs_node)
    g.add_node("detect_language", detect_language_node)
    g.add_node("requirements", requirements_node)
    g.add_node("analyst", analyst_node)
    g.add_node("ask_user", ask_user_node)
    g.add_node("stories", stories_node)
    g.add_node("tasks", tasks_node)
    g.add_node("checks", checks_node)
    g.add_node("critic", critic_node)
    g.add_node("finalize", finalize_node)
    g.add_edge(START, "parse_inputs")
    g.add_edge("parse_inputs", "detect_language")
    g.add_edge("detect_language", "requirements")
    g.add_edge("requirements", "analyst")
    g.add_edge("analyst", "ask_user")
    g.add_edge("ask_user", "stories")
    g.add_edge("stories", "tasks")
    g.add_edge("tasks", "checks")
    g.add_edge("checks", "critic")
    g.add_conditional_edges("critic", after_critic, ["tasks", "finalize"])
    g.add_edge("finalize", END)
    return g.compile(checkpointer=checkpointer)


graph = build_graph()
