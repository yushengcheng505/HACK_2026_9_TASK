import io
import json
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


def test_rejects_pdf_and_empty_epic(client):
    pdf = [("product_docs", ("spec.pdf", b"%PDF"))]
    assert client.post("/api/runs", data={"title": "x", "text": "y"}, files=pdf).status_code == 422
    assert client.post("/api/runs", data={"title": "x", "text": "  "}).status_code == 422
