import asyncio
import io
import json
import threading
import time

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.main import create_app
from tests.fake_llm import FakeLLM


@pytest.fixture
def client():
    with TestClient(create_app(llm=FakeLLM())) as c:
        yield c


def wait_status(client, run_id, statuses, timeout=10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in statuses:
            return run
        time.sleep(0.05)
    raise AssertionError(f"статус {run['status']}, ждали {statuses}")


def read_sse(client, url) -> list[tuple[str, dict]]:
    events = []
    with client.stream("GET", url) as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        kind = None
        for line in r.iter_lines():
            if line.startswith("event: "):
                kind = line[7:]
            elif line.startswith("data: "):
                events.append((kind, json.loads(line[6:])))
    return events


def test_health_and_demos(client):
    assert client.get("/api/health").json()["model"] == "fake-model"
    demos = client.get("/api/demos").json()
    assert demos[0]["id"] == "boutique-delivery"
    assert any(f["name"] == "courier.proto" for f in demos[0]["files"])


def test_demo_run_to_exports(client):
    run_id = client.post("/api/demos/boutique-delivery/run", json={"skip_questions": True}).json()["run_id"]
    run = wait_status(client, run_id, ("done", "failed"))
    assert run["status"] == "done", run.get("error")
    assert run["result"]["stats"]["tasks_count"] == 4
    assert run["prompt_versions"]["tasks"]

    events = read_sse(client, f"/api/runs/{run_id}/events")
    types = [t for t, _ in events]
    assert types[0] == "run_started" and types[-1] == "run_finished"
    assert "task_created" in types

    tail = read_sse(client, f"/api/runs/{run_id}/events?after={len(events) - 1}")
    assert [t for t, _ in tail] == ["run_finished"]
    replayed = read_sse(client, f"/api/runs/{run_id}/events?replay=1&speed=50")
    assert [t for t, _ in replayed] == types

    data = client.get(f"/api/runs/{run_id}/export/json")
    assert data.json()["stats"]["stories_count"] == 2
    assert "_Autogenerate.json" in data.headers["content-disposition"]
    assert f'filename="decomposition-{run_id}.json"' in data.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(client.get(f"/api/runs/{run_id}/export/xlsx").content))
    assert "Истории и задачи" in wb.sheetnames
    assert client.get(f"/api/runs/{run_id}/export/docx").content[:2] == b"PK"
    assert client.get(f"/api/runs/{run_id}/export/pdf").status_code == 404

    history = client.get("/api/runs").json()
    assert history[0]["id"] == run_id and history[0]["stats"]["tasks_count"] == 4


def test_questions_then_answers(client):
    run_id = client.post("/api/demos/boutique-delivery/run", json={}).json()["run_id"]
    run = wait_status(client, run_id, ("waiting_answers", "failed"))
    assert run["questions"][0]["id"] == "Q-1"
    assert client.post(f"/api/runs/{run_id}/answers", json={"answers": {"Q-1": "Да, с ключом"}}).status_code == 200
    run = wait_status(client, run_id, ("done", "failed"))
    assert run["result"]["questions"][0]["answer"] == "Да, с ключом"
    assert client.post(f"/api/runs/{run_id}/answers", json={}).status_code == 409


def test_answers_to_unknown_questions_are_rejected(client):
    run_id = client.post("/api/demos/boutique-delivery/run", json={}).json()["run_id"]
    wait_status(client, run_id, ("waiting_answers", "failed"))
    r = client.post(f"/api/runs/{run_id}/answers", json={"answers": {"Q-1": "Да", "Q-9": "Нет такого"}})
    assert r.status_code == 422
    assert "Q-9" in r.json()["detail"]
    assert client.get(f"/api/runs/{run_id}").json()["status"] == "waiting_answers"


def test_upload_run_and_edit_result(client):
    files = [("contracts", ("courier.proto", open("../demo/boutique-delivery/contracts/courier.proto", "rb")))]
    form = {"title": "Доставка", "text": "Создавать отправление после оплаты.\n\nПоказывать стоимость.",
            "skip_questions": "true"}
    run_id = client.post("/api/runs", data=form, files=files).json()["run_id"]
    run = wait_status(client, run_id, ("done", "failed"))
    assert run["status"] == "done", run.get("error")

    result = run["result"]
    result["stories"][0]["tasks"] = []
    edited = client.put(f"/api/runs/{run_id}/result", json=result).json()
    assert "REQ-001" in edited["coverage"]["uncovered_requirements"]
    assert edited["stats"]["tasks_count"] == 2
    assert client.get(f"/api/runs/{run_id}").json()["result"]["stats"]["tasks_count"] == 2


class GatedLLM(FakeLLM):
    """Шаг «Истории» ждёт, пока тест его не отпустит, — так прогон гарантированно идёт в момент паузы."""

    def __init__(self):
        super().__init__()
        self.release = threading.Event()

    async def complete_json(self, prompt_name, user, schema, on_token=None, on_retry=None):
        if prompt_name == "stories":
            self.calls["stories"].append(user)
            while not self.release.is_set():
                await asyncio.sleep(0.01)
            self.calls["stories"].pop()
        return await super().complete_json(prompt_name, user, schema, on_token, on_retry)


def test_pause_and_resume():
    llm = GatedLLM()
    with TestClient(create_app(llm=llm)) as client:
        run_id = client.post("/api/demos/boutique-delivery/run", json={"skip_questions": True}).json()["run_id"]
        deadline = time.time() + 10
        while not llm.calls["stories"] and time.time() < deadline:
            time.sleep(0.02)
        assert client.post(f"/api/runs/{run_id}/resume").status_code == 409
        assert client.post(f"/api/runs/{run_id}/pause").status_code == 200
        wait_status(client, run_id, ("paused",))
        assert client.post(f"/api/runs/{run_id}/pause").status_code == 409

        llm.release.set()
        assert client.post(f"/api/runs/{run_id}/resume").status_code == 200
        run = wait_status(client, run_id, ("done", "failed"))
        assert run["status"] == "done", run.get("error")
        assert run["result"]["stats"]["stories_count"] == 2
        types = [t for t, _ in read_sse(client, f"/api/runs/{run_id}/events")]
        assert types.index("run_paused") < types.index("run_resumed") < types.index("run_finished")
        assert types.count("requirement_created") == 2


def test_concurrency_at_start_and_during_run():
    llm = GatedLLM()
    with TestClient(create_app(llm=llm)) as client:
        assert client.post("/api/demos/boutique-delivery/run", json={"concurrency": 0}).status_code == 422
        run_id = client.post("/api/demos/boutique-delivery/run",
                             json={"skip_questions": True, "concurrency": 3}).json()["run_id"]
        assert client.get(f"/api/runs/{run_id}").json()["concurrency"] == 3
        deadline = time.time() + 10
        while not llm.calls["stories"] and time.time() < deadline:
            time.sleep(0.02)

        assert client.put(f"/api/runs/{run_id}/concurrency", json={"value": 6}).json() == {"concurrency": 6}
        assert client.put(f"/api/runs/{run_id}/concurrency", json={"value": 99}).status_code == 422
        assert client.put("/api/runs/nope/concurrency", json={"value": 2}).status_code == 404
        llm.release.set()
        run = wait_status(client, run_id, ("done", "failed"))
        assert run["status"] == "done" and run["concurrency"] == 6
        events = read_sse(client, f"/api/runs/{run_id}/events")
        started = next(d for t, d in events if t == "run_started")
        assert started["concurrency"] == 3
        assert [d for t, d in events if t == "concurrency_changed"] == [{"concurrency": 6}]


def test_prompt_override_and_reset(client):
    from app.prompts import load_prompt

    prompts = {p["name"]: p for p in client.get("/api/prompts").json()}
    assert "tasks" in prompts and not prompts["tasks"]["overridden"]
    original = prompts["tasks"]["text"]

    edited = client.put("/api/prompts/tasks", json={"text": original + "\nДобавлено в интерфейсе."}).json()
    assert edited["overridden"] and edited["version"] != edited["default_version"]
    assert load_prompt("tasks").text.endswith("Добавлено в интерфейсе.")
    run_id = client.post("/api/demos/boutique-delivery/run", json={"skip_questions": True}).json()["run_id"]
    assert wait_status(client, run_id, ("done", "failed"))["prompt_versions"]["tasks"] == edited["version"]

    same = client.put("/api/prompts/tasks", json={"text": original}).json()
    assert not same["overridden"]
    client.put("/api/prompts/tasks", json={"text": "другой"})
    assert client.delete("/api/prompts/tasks").json()["text"] == original
    assert client.put("/api/prompts/tasks", json={"text": "  "}).status_code == 422
    assert client.put("/api/prompts/../config", json={"text": "x"}).status_code == 404
    assert client.put("/api/prompts/nope", json={"text": "x"}).status_code == 404


def test_providers_crud_and_run_model(client):
    providers = client.get("/api/providers").json()
    assert providers[0]["id"] == "env" and providers[0]["default_model"] == "fake-model"

    body = {"name": "ARCMUX", "base_url": "https://api.example.test/v1/", "api_key": "secret-key",
            "default_model": "gpt-x"}
    created = client.post("/api/providers", json=body).json()
    assert created["has_key"] and created["base_url"] == "https://api.example.test/v1"
    assert "secret-key" not in json.dumps(client.get("/api/providers").json())

    # ключ не передан — сохранённый остаётся; пустая строка — убирает
    kept = client.put(f"/api/providers/{created['id']}", json={**body, "api_key": None, "name": "Другое имя"}).json()
    assert kept["has_key"] and kept["name"] == "Другое имя"
    assert not client.put(f"/api/providers/{created['id']}", json={**body, "api_key": ""}).json()["has_key"]
    assert client.post("/api/providers", json={**body, "base_url": "ftp://x"}).status_code == 422

    # прогон с серверной моделью по умолчанию; модель записывается в прогон
    run_id = client.post("/api/demos/boutique-delivery/run",
                         json={"skip_questions": True, "provider_id": "env"}).json()["run_id"]
    assert wait_status(client, run_id, ("done", "failed"))["model"] == "fake-model"
    r = client.post("/api/demos/boutique-delivery/run", json={"provider_id": "nope", "model": "m"})
    assert r.status_code == 422

    assert client.delete(f"/api/providers/{created['id']}").status_code == 200
    assert client.delete(f"/api/providers/{created['id']}").status_code == 404
    assert [p["id"] for p in client.get("/api/providers").json()] == ["env"]


def test_bench_reports(client):
    data = client.get("/api/bench").json()
    assert data["summary"]["title"].startswith("Проверяющие агенты")
    ids = [s["id"] for s in data["series"]]
    assert "2026-11-14" in ids and ids == sorted(ids, reverse=True)
    assert all(s["markdown"].startswith("# ") for s in data["series"])


def test_rejects_pdf_and_empty_epic(client):
    pdf = [("product_docs", ("spec.pdf", b"%PDF"))]
    assert client.post("/api/runs", data={"title": "x", "text": "y"}, files=pdf).status_code == 422
    assert client.post("/api/runs", data={"title": "x", "text": "  "}).status_code == 422
