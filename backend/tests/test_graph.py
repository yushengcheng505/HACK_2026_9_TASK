from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from app.demos import load_demo
from app.graph import build_graph, encode_files
from app.schemas import Decomposition
from tests.fake_llm import FakeLLM


def demo_input(skip_questions: bool) -> dict:
    demo = load_demo("boutique-delivery")
    return {"title": demo.title, "epic_text": demo.epic_text, "files": encode_files(demo.files),
            "skip_questions": skip_questions}


async def run(graph, payload, config):
    events, interrupts = [], []
    async for mode, chunk in graph.astream(payload, config, stream_mode=["custom", "updates"]):
        if mode == "custom":
            events.append(chunk)
        elif "__interrupt__" in chunk:
            interrupts.extend(chunk["__interrupt__"])
    return events, interrupts


async def test_full_run_with_assumptions_and_critic_loop():
    llm = FakeLLM()
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "t1", "llm": llm}}
    events, interrupts = await run(graph, demo_input(skip_questions=True), config)
    assert interrupts == []
    state = (await graph.aget_state(config)).values
    result = Decomposition.model_validate(state["result"])

    assert result.target_language.value == "Go"
    assert [s.id for s in result.stories] == ["US-001", "US-002"]
    task_ids = [t.id for s in result.stories for t in s.tasks]
    assert len(task_ids) == len(set(task_ids)) == 4
    # US-001 — по замечанию критика, US-002 — из-за выдуманного API: обе переделаны один раз
    assert len(llm.calls["tasks"]) == 4
    assert len(llm.calls["critic"]) == 2
    redo_prompt = next(u for u in llm.calls["tasks"] if "Замечания, которые нужно исправить" in u)
    assert "## Текущие задачи истории" in redo_prompt
    assert result.coverage.unknown_refs == []
    assert result.coverage.coverage_percent == 100.0
    assert "PROTO:CourierService.PrintLabel" in result.coverage.contract_ops_unused
    assert result.stats.tasks_count == 4 and result.stats.stories_count == 2
    assert any("принято без ответа" in a for a in result.assumptions)
    assert result.epic.label.endswith("_Autogenerate")
    assert result.gaps[0].id == "GAP-1"
    assert set(result.prompt_versions) >= {"requirements", "tasks", "critic"}

    types = [e["type"] for e in events]
    assert types[0] == "node_started"
    parsed = next(e["data"] for e in events if e["type"] == "sources_parsed")
    assert "Каждый вызов" in next(s["excerpt"] for s in parsed["sources"]
                                  if s["id"] == "PROTO:CourierService.CreateShipment")
    for t in ("sources_parsed", "language_detected", "requirement_created", "gap_found", "questions_asked",
              "answers_received", "story_created", "task_created", "tasks_replaced", "checks_finished",
              "critic_feedback", "token", "run_finished"):
        assert t in types, t


async def test_critic_failure_does_not_fail_run():
    from app.llm import LLMError

    llm = FakeLLM()

    def broken(user):
        raise LLMError("пустой ответ")

    llm.replies["critic"] = broken
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "t-critic", "llm": llm}}
    events, _ = await run(graph, demo_input(skip_questions=True), config)
    result = Decomposition.model_validate((await graph.aget_state(config)).values["result"])
    assert result.stats.tasks_count == 4
    feedback = [e["data"] for e in events if e["type"] == "critic_feedback"]
    assert feedback[0]["error"] == "пустой ответ"


async def test_pause_for_questions_and_resume_with_answers():
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "t2", "llm": FakeLLM()}}
    _, interrupts = await run(graph, demo_input(skip_questions=False), config)
    assert len(interrupts) == 1
    assert interrupts[0].value["questions"][0]["id"] == "Q-1"
    assert "result" not in (await graph.aget_state(config)).values

    events, interrupts = await run(graph, Command(resume={"Q-1": "Да, с ключом идемпотентности"}), config)
    assert interrupts == []
    result = Decomposition.model_validate((await graph.aget_state(config)).values["result"])
    assert result.questions[0].answer == "Да, с ключом идемпотентности"
    assert not any("Повторять" in a for a in result.assumptions)
    assert events[0]["type"] == "answers_received"


async def test_epic_only_asks_language():
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "t3", "llm": FakeLLM()}}
    payload = {"title": "Отчёт", "epic_text": "Нужен отчёт по продажам.", "files": [], "skip_questions": False}
    _, interrupts = await run(graph, payload, config)
    assert interrupts[0].value["questions"][0]["id"] == "Q-LANG"
    await run(graph, Command(resume={"Q-LANG": "C++"}), config)
    result = Decomposition.model_validate((await graph.aget_state(config)).values["result"])
    assert result.target_language.value == "C++"
    assert result.target_language.confidence == 1.0
