import re

from langgraph.checkpoint.memory import InMemorySaver

from app.graph import build_graph
from app.llm import LLMError
from app.schemas import Decomposition
from tests.fake_llm import FakeLLM
from tests.test_graph import demo_input, run

QUOTE = {"where": "source", "ref": "PROTO:CourierService.CreateShipment", "quote": "Каждый вызов создаёт новое отправление"}


async def run_demo(llm, thread, **options):
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": thread, "llm": llm, **options}}
    events, _ = await run(graph, demo_input(skip_questions=True), config)
    result = Decomposition.model_validate((await graph.aget_state(config)).values["result"])
    return events, result


def of(events, type_):
    return [e["data"] for e in events if e["type"] == type_]


def finding(kind="failure_not_handled", severity="high", tasks=("TASK-001",), evidence=(QUOTE,), **extra):
    return {"kind": kind, "severity": severity, "confidence": 90, "task_ids": list(tasks),
            "scenario": "что-то пойдёт не так", "evidence": list(evidence), "fix": "исправить", **extra}


def reviewer_with(llm, story_id, findings, mode="полная проверка"):
    base = llm.replies["reviewer"]

    def reviewer(user):
        out = base(user)
        if f"## История {story_id}" in user and f"## Режим: {mode}" in user:
            out["findings"] = findings
        return out

    llm.replies["reviewer"] = reviewer


async def test_round_one_calls_every_role_and_redoes_confirmed_story():
    llm = FakeLLM()
    events, result = await run_demo(llm, "r-calls")
    assert len(llm.calls["junction"]) == len(llm.calls["simplifier"]) == 1
    full = [u for u in llm.calls["reviewer"] if "## Режим: полная проверка" in u]
    assert len(full) == 2
    assert len(llm.calls["skeptic"]) == 2  # пробелы аналитика и круг 1
    confirmed = next(f for f in result.findings if f.source == "reviewer")
    assert confirmed.verdict == "confirmed"
    redo = next(u for u in llm.calls["tasks"] if "## История US-001" in u and "Замечания, которые нужно" in u)
    assert f"[{confirmed.id}] HIGH" in redo
    assert confirmed.resolution == "resolved"
    assert of(events, "critic_feedback") and of(events, "findings_collected") and of(events, "findings_judged")
    assert result.stats.tasks_count == 4


async def test_simplifier_can_be_disabled_per_run():
    llm = FakeLLM()
    await run_demo(llm, "r-nosimp", review_simplifier=False)
    assert llm.calls["simplifier"] == []


async def test_low_finding_is_deferred_without_redo():
    llm = FakeLLM()
    reviewer_with(llm, "US-001", [finding(severity="low")])
    _, result = await run_demo(llm, "r-low")
    low = next(f for f in result.findings if f.source == "reviewer")
    assert low.verdict == "deferred"
    assert not any("## История US-001" in u and "Замечания, которые нужно" in u for u in llm.calls["tasks"])


async def test_confirmed_duplicate_is_removed_by_code():
    llm = FakeLLM()
    llm.replies["junction"] = lambda user: {"findings": [finding(
        kind="duplicate", tasks=("TASK-001", "TASK-003"),
        evidence=({"where": "task", "ref": "TASK-001", "quote": "Реализовать вызов PROTO:CourierService"},))]}
    events, result = await run_demo(llm, "r-dup")
    assert of(events, "tasks_removed")[0]["task_ids"] == ["TASK-003"]
    assert [len(s.tasks) for s in result.stories] == [2, 1]
    assert len([u for u in llm.calls["tasks"] if "## История US-002" in u]) == 1
    dup = next(f for f in result.findings if f.kind == "duplicate")
    assert dup.resolution == "fixed"


async def test_invented_quote_never_reaches_skeptic():
    llm = FakeLLM()
    llm.replies["simplifier"] = lambda user: {"findings": [finding(
        kind="merge_tasks", tasks=("TASK-001", "TASK-002"),
        evidence=({"where": "task", "ref": "TASK-001", "quote": "этого текста нет нигде во входах"},))]}
    _, result = await run_demo(llm, "r-quote")
    fake = next(f for f in result.findings if f.source == "simplifier")
    assert fake.verdict == "rejected_by_filter"
    assert not any(f'"id": "{fake.id}"' in u for u in llm.calls["skeptic"])


async def test_skeptic_failure_confirms_high_and_rejects_simplifications():
    llm = FakeLLM()
    llm.replies["simplifier"] = lambda user: {"findings": [finding(
        kind="merge_tasks", severity="medium", tasks=("TASK-001", "TASK-002"),
        evidence=({"where": "task", "ref": "TASK-001", "quote": "Реализовать вызов PROTO:CourierService"},))]}

    def broken(user):
        raise LLMError("пустой ответ")

    llm.replies["skeptic"] = broken
    events, result = await run_demo(llm, "r-skeptic-down")
    by_source = {f.source: f for f in result.findings}
    assert by_source["reviewer"].verdict == "confirmed"
    assert by_source["simplifier"].verdict == "rejected"
    assert by_source["analyst"].verdict == "confirmed" and len(result.gaps) == 1
    assert {s.step for s in result.review_skipped} >= {"skeptic", "skeptic:gaps"}
    assert of(events, "review_skipped")


async def test_skeptic_disabled_per_run():
    llm = FakeLLM()
    _, result = await run_demo(llm, "r-noskeptic", review_skeptic=False)
    assert llm.calls["skeptic"] == []
    high = next(f for f in result.findings if f.source == "reviewer")
    assert high.verdict == "confirmed" and "скептик выключен" in high.verdict_reason


async def test_reviewer_failure_is_marked_not_verified():
    llm = FakeLLM()
    base = llm.replies["reviewer"]

    def reviewer(user):
        if "## История US-002" in user:
            raise LLMError("невалидный JSON")
        return base(user)

    llm.replies["reviewer"] = reviewer
    _, result = await run_demo(llm, "r-reviewer-down")
    assert any(s.step == "reviewer" and s.story_id == "US-002" for s in result.review_skipped)


async def test_generator_dispute_reaches_next_round_and_resolution_check_runs():
    llm = FakeLLM()
    base_tasks, base_reviewer = llm.replies["tasks"], llm.replies["reviewer"]

    def tasks(user):
        out = base_tasks(user)
        ids = re.findall(r"\[(F-\d+)\]", user)
        if ids:
            out["responses"] = [{"finding_id": ids[0], "status": "disputed", "note": "ключ уже в TASK-001"}]
        return out

    def reviewer(user):
        out = base_reviewer(user)
        if "## Режим: изменения и решённость" in user:
            out["resolutions"] = [dict(r, status="not_resolved", note="ключа всё ещё нет") for r in out["resolutions"]]
        return out

    llm.replies["tasks"], llm.replies["reviewer"] = tasks, reviewer
    events, result = await run_demo(llm, "r-dispute")
    delta = next(u for u in llm.calls["reviewer"] if "## Режим: изменения и решённость" in u and "US-001" in u)
    assert "Ответ генератора: disputed — ключ уже в TASK-001" in delta
    assert any("## Режим: только решённость" in u for u in llm.calls["reviewer"])
    assert of(events, "findings_resolution")
    high = next(f for f in result.findings if f.source == "reviewer")
    assert high.resolution == "resolved"


async def test_gap_with_invented_quote_is_dropped_but_logged():
    llm = FakeLLM()
    base = llm.replies["analyst"]

    def analyst(user):
        out = base(user)
        out["gaps"][0]["evidence"] = [{"source_id": "EPIC-4", "quote": "фраза, которой нет в эпике"}]
        return out

    llm.replies["analyst"] = analyst
    _, result = await run_demo(llm, "r-gap")
    assert result.gaps == []
    gap = next(f for f in result.findings if f.source == "analyst")
    assert gap.verdict == "rejected_by_filter"
