import io
import zipfile

from app.store import Store


def test_requests_share_event_sequence(tmp_path):
    store = Store(tmp_path / "app.db")
    store.add_llm_request("run", "first", "tasks", "первый")
    store.add_llm_request("run", "second", "tasks", "второй")
    event = store.add_event("run", "node_started", {"node": "tasks"})
    store.add_llm_request("run", "third", "tasks", "третий")
    requests = store.llm_requests("run")
    assert [r["seq"] for r in requests] == [0, 0, event.seq]
    assert [r["user"] for r in requests] == ["первый", "второй", "третий"]
    assert all(r["ts"] > 0 for r in requests)
    assert store.llm_requests("missing") == []
    assert store.prompt_text("missing", "version") is None


async def test_graph_without_runner_or_custom_stream():
    from app.graph import build_graph
    from tests.fake_llm import FakeLLM
    from tests.test_graph import demo_input

    result = await build_graph().ainvoke(demo_input(skip_questions=True), {"configurable": {"llm": FakeLLM()}})
    assert result["result"]["stats"]["tasks_count"] == 4


def test_steps_interleave_requests_and_join_token_chunks():
    from app.bundle import build_bundle

    node = "tasks:US-001"
    events = [
        {"seq": 1, "ts": 1.0, "type": "node_started", "data": {"node": node}},
        {"seq": 2, "ts": 3.0, "type": "token", "data": {"node": node, "kind": "reasoning", "text": "ду"}},
        {"seq": 3, "ts": 4.0, "type": "token", "data": {"node": node, "kind": "reasoning", "text": "маю"}},
        {"seq": 4, "ts": 5.0, "type": "token", "data": {"node": node, "kind": "content", "text": "от"}},
        {"seq": 5, "ts": 6.0, "type": "token", "data": {"node": node, "kind": "content", "text": "вет"}},
        {"seq": 6, "ts": 7.0, "type": "llm_retry", "data": {"node": node, "attempt": 2, "reason": "ошибка"}},
        {"seq": 7, "ts": 8.0, "type": "node_finished", "data": {"node": node}},
    ]
    requests = [{"seq": 1, "ts": 2.0, "node": node, "prompt": "tasks", "user": "вход ``` внутри"},
                {"seq": 6, "ts": 7.5, "node": node, "prompt": "tasks", "user": "новый вход"}]
    data = build_bundle({"id": "run", "result": None}, None, {}, events, requests)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        text = archive.read("steps/01_tasks_US-001.md").decode()
        markers = ["node_started", "вход ``` внутри", "### Рассуждения\n\nдумаю",
                   "### Ответ\n\nответ", "> Повтор 2: ошибка", "новый вход", "node_finished"]
        positions = [text.index(marker) for marker in markers]
        assert positions == sorted(positions)
        assert text.count("### Рассуждения") == 1
        assert text.count("### Ответ") == 1
